# Stockmantra on Kubernetes

Classic 3-tier topology: React SPA (nginx) → FastAPI (Deployment, HPA) → Postgres (StatefulSet). Scheduled work runs as `CronJob`s instead of in-process APScheduler.

## Prerequisites

- A running Kubernetes cluster (Kind, Docker Desktop K8s, or minikube).
- `ingress-nginx` controller installed (see **Install ingress-nginx** below if missing).
- Images available in the cluster:
  - `stockmantra-backend:phase2`
  - `stockmantra-frontend:phase2`
  - Build with `docker build -t stockmantra-backend:phase2 backend` and `docker build -t stockmantra-frontend:phase2 frontend`.
  - On Kind, load them: `kind load docker-image stockmantra-backend:phase2 stockmantra-frontend:phase2 --name <cluster>`.
  - On Docker Desktop K8s, no load step needed — same daemon.

## Install ingress-nginx (Kind)

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.11.3/deploy/static/provider/kind/deploy.yaml
kubectl wait --namespace ingress-nginx --for=condition=ready pod --selector=app.kubernetes.io/component=controller --timeout=120s
```

## Deploy

1. Copy the secret example and fill in real values:
   ```bash
   cp k8s/base/secret.example.yaml k8s/base/secret.yaml
   # Edit secret.yaml — set POSTGRES_PASSWORD. AI keys optional.
   ```
2. Apply everything:
   ```bash
   kubectl apply -k k8s/base
   ```
3. Watch rollout:
   ```bash
   kubectl -n stockmantra get pods -w
   ```

## Reach the app

Add to Windows hosts file (`C:\Windows\System32\drivers\etc\hosts`):
```
127.0.0.1  stockmantra.local
```

Browse to `http://stockmantra.local` — nginx-ingress (Kind) binds host port 80.

## Operate

```bash
# Logs
kubectl -n stockmantra logs deploy/api --tail=50 -f
kubectl -n stockmantra logs statefulset/postgres --tail=50

# Scale API
kubectl -n stockmantra scale deploy/api --replicas=3

# Trigger a CronJob manually (great for testing)
kubectl -n stockmantra create job --from=cronjob/catchup-watchdog catchup-manual
kubectl -n stockmantra logs job/catchup-manual -f

# Shell into Postgres
kubectl -n stockmantra exec -it postgres-0 -- psql -U stockmantra -d stockmantra
```

## Tear down

```bash
kubectl delete -k k8s/base
# Then (optionally) remove the PVC to wipe DB data:
kubectl -n stockmantra delete pvc data-postgres-0
```
