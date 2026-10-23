# Jenkins CI/CD on Docker Desktop k8s

End-to-end: push to `master` on GitHub → smee.io relays the webhook to the
in-cluster Jenkins → pipeline builds both images and rolls out the `api` and
`frontend` deployments in the `stockmantra` namespace.

## One-time setup

### 1. Build the custom Jenkins image (on the Docker Desktop host)

```powershell
cd C:\Projects\Stockmantra
docker build -t stockmantra-jenkins:local jenkins/
```

This bakes in Docker CLI + kubectl + the pipeline plugins so first boot is
hands-off.

### 2. Apply the manifests

```powershell
kubectl apply -f jenkins/namespace.yaml
kubectl apply -f jenkins/rbac.yaml
kubectl apply -f jenkins/pvc.yaml
kubectl apply -f jenkins/deployment.yaml
kubectl apply -f jenkins/service.yaml
```

Confirm it's up:

```powershell
kubectl -n jenkins get pods -w
```

### 3. First-boot login

```powershell
kubectl -n jenkins exec deploy/jenkins -- cat /var/jenkins_home/secrets/initialAdminPassword
```

Open http://localhost:30808, paste the password, pick "Select plugins to
install" → **None** (we baked them in), then create an admin user.

### 4. Create the pipeline job

- New Item → "stockmantra" → **Pipeline** → OK.
- **Pipeline** section:
  - Definition: *Pipeline script from SCM*
  - SCM: *Git*
  - Repository URL: `https://github.com/mrsrujan/3T.git`
  - Branch: `*/master`
  - Script Path: `Jenkinsfile`
- **Build Triggers** → check *GitHub hook trigger for GITScm polling*.
- Save.

Hit **Build Now** once to prove the pipeline works end-to-end before wiring
GitHub. It should build both images and update the deployments.

### 5. Wire GitHub → smee.io → Jenkins

1. Visit <https://smee.io/new> — copy the generated URL (e.g.
   `https://smee.io/aB1cD2eF3gH4`).
2. Edit `jenkins/smee.yaml`: replace `REPLACE_ME_WITH_YOUR_SMEE_URL` with
   that URL.
3. Apply it:

   ```powershell
   kubectl apply -f jenkins/smee.yaml
   kubectl -n jenkins logs deploy/smee-client -f
   ```

   You should see `Forwarding https://smee.io/... to http://jenkins.../github-webhook/`.
4. In the GitHub repo → **Settings → Webhooks → Add webhook**:
   - Payload URL: the smee URL
   - Content type: `application/json`
   - Which events: *Just the push event*
   - Active: ✔
5. Push a commit to `master`. Within a few seconds the smee pod logs show
   the delivery, and Jenkins kicks off a build.

## Day-to-day

Push to master → auto-build. That's it.

- Jenkins UI: http://localhost:30808
- Pipeline logs: Build # → Console Output (or Blue Ocean for the pretty view)
- Rollback: `kubectl -n stockmantra rollout undo deploy/api` (or `deploy/frontend`)

## Troubleshooting

| Symptom | Fix |
|---|---|
| `docker: permission denied` on the socket | Confirm `/var/run/docker.sock` is mounted and the pod is `runAsUser: 0`. |
| `ImagePullBackOff` on `stockmantra-backend:ci-N` | The build didn't land in the host daemon. Check `docker images` on the host; verify socket mount. |
| Pipeline runs but k8s shows old pods | `imagePullPolicy: IfNotPresent` + unchanged tag = no restart. Each build must use a new `ci-N` tag (the Jenkinsfile does this). |
| Push doesn't trigger | `kubectl -n jenkins logs deploy/smee-client` — if it's silent, the smee URL in the manifest doesn't match the GitHub webhook URL. |
| `kubectl: forbidden` in pipeline | RBAC not applied, or namespace mismatch. Re-apply `jenkins/rbac.yaml`. |

## Things to add later (deliberately not here yet)

- Build agents in k8s pods instead of running on the controller.
- Image signing / SBOM.
- A real registry (ghcr.io) once you have more than one node.
- Separate dev/prod namespaces + manual approval gate.
- Jenkins Configuration-as-Code (JCasC) so the UI setup above becomes a yaml.
