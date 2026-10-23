# Custom Jenkins image: adds Docker CLI + kubectl so the controller can build
# images against the host's Docker daemon (via mounted /var/run/docker.sock)
# and update deployments in the stockmantra namespace.
#
# Build on your Docker Desktop host (NOT inside Jenkins) so the resulting image
# lives in the same daemon that k8s pulls from:
#   docker build -t stockmantra-jenkins:local jenkins/
FROM jenkins/jenkins:lts-jdk17

USER root

# Docker CLI (we talk to the host daemon over the mounted socket; no dockerd here)
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg lsb-release \
 && install -m 0755 -d /etc/apt/keyrings \
 && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
 && chmod a+r /etc/apt/keyrings/docker.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends docker-ce-cli \
 && rm -rf /var/lib/apt/lists/*

# kubectl matching Docker Desktop's bundled k8s (safe to pin loosely)
RUN curl -fsSL -o /usr/local/bin/kubectl https://dl.k8s.io/release/v1.30.0/bin/linux/amd64/kubectl \
 && chmod +x /usr/local/bin/kubectl

# Pre-install the plugins the Jenkinsfile needs so you don't click through
# the UI plugin wizard on first boot.
COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt

# Run as root inside the container so Jenkins can talk to the mounted
# /var/run/docker.sock regardless of the host's docker group gid. Fine for
# local Docker Desktop; tighten later with a matched gid when you're ready.
USER root
