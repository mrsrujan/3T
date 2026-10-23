// Minimal CI/CD for Docker Desktop k8s.
// On each push to master: build both images (tagged ci-<build>), update the
// api + frontend deployments in the stockmantra namespace, wait for rollout.
// No registry: images land in the host Docker daemon via the mounted socket,
// which is the same daemon k8s pulls from.
pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  triggers {
    // Fires when the GitHub plugin receives a push via the webhook relay.
    githubPush()
  }

  environment {
    NAMESPACE     = 'default'
    BACKEND_IMAGE = "stockmantra-backend:ci-${BUILD_NUMBER}"
    FRONTEND_IMAGE= "stockmantra-frontend:ci-${BUILD_NUMBER}"
  }

  stages {
    stage('Checkout') {
      steps { checkout scm }
    }

    stage('Build backend image') {
      steps {
        sh 'docker build -t $BACKEND_IMAGE ./backend'
      }
    }

    stage('Build frontend image') {
      steps {
        sh 'docker build -t $FRONTEND_IMAGE ./frontend'
      }
    }

    stage('Deploy to k8s') {
      steps {
        // Both the init container (migrate) and the main container share the
        // backend image, so update both in one call.
        sh '''
          kubectl -n $NAMESPACE set image deploy/api \
            migrate=$BACKEND_IMAGE \
            api=$BACKEND_IMAGE
          kubectl -n $NAMESPACE set image deploy/frontend \
            frontend=$FRONTEND_IMAGE
        '''
      }
    }

    stage('Wait for rollout') {
      steps {
        sh 'kubectl -n $NAMESPACE rollout status deploy/api      --timeout=180s'
        sh 'kubectl -n $NAMESPACE rollout status deploy/frontend --timeout=180s'
      }
    }
  }

  post {
    success { echo "Deployed ${BACKEND_IMAGE} + ${FRONTEND_IMAGE}" }
    failure {
      // Dump recent events and pod status to the console so a failed rollout
      // is debuggable without opening kubectl.
      sh '''
        kubectl -n $NAMESPACE get pods -o wide || true
        kubectl -n $NAMESPACE get events --sort-by=.lastTimestamp | tail -30 || true
      '''
    }
  }
}
