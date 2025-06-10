pipeline {
    agent any
    
    environment {
        NODE_ENV = 'test'
        SKIP_DB_CONNECTION = 'true'
        JEST_JUNIT_OUTPUT = 'test-results/junit.xml'
        DOCKER_IMAGE = 'microservice-paiement'
        DOCKER_REGISTRY = 'docker.io/mbrabaa2023'
        DOCKER_TAG = "${env.BUILD_NUMBER}-${env.GIT_COMMIT?.take(7) ?: 'unknown'}"
        CONTAINER_NAME = 'microservice-paiement-container'
        SERVICE_PORT = '3002'
        KUBE_NAMESPACE = 'frontend'
        KUBECONFIG = credentials('k3s-jenkins-config')
    }
    
    options {
        timeout(time: 30, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '5'))
    }
    
    stages {
        stage('Checkout') {
            steps {
                checkout scm
                sh 'git rev-parse HEAD > .git/commit-id'
                script {
                    env.GIT_COMMIT = sh(returnStdout: true, script: 'git rev-parse HEAD').trim()
                }
            }
        }
        
        stage('Setup Environment') {
            steps {
                script {
                    try {
                        sh 'node --version'
                        sh 'npm --version'
                        sh 'docker --version'
                        sh 'kubectl version --client'
                    } catch (Exception e) {
                        error("Erreur lors de la vérification des versions: ${e.message}")
                    }
                }
            }
        }
        
        stage('Install Dependencies') {
            steps {
                dir('backend') {
                    sh 'npm ci --prefer-offline --audit false'
                }
            }
        }
        
        stage('Build Application') {
            steps {
                dir('backend') {
                    sh 'npm run build'
                }
            }
        }
        
        stage('Run Tests') {
            steps {
                dir('backend') {
                    sh 'npm run test:ci'
                }
            }
            post {
                always {
                    junit 'backend/test-results/junit.xml'
                    publishHTML(target: [
                        reportDir: 'backend/coverage/lcov-report',
                        reportFiles: 'index.html',
                        reportName: 'Coverage Report'
                    ])
                }
            }
        }
        
        stage('Build and Push Docker Image') {
            when {
                expression { 
                    fileExists('backend/Dockerfile') 
                }
            }
            steps {
                dir('backend') {
                    script {
                        withCredentials([usernamePassword(
                            credentialsId: 'docker-hub-creds',
                            usernameVariable: 'DOCKER_USER',
                            passwordVariable: 'DOCKER_PASS'
                        )]) {
                            sh """
                                docker login -u $DOCKER_USER -p $DOCKER_PASS ${env.DOCKER_REGISTRY}
                                docker build -t ${env.DOCKER_REGISTRY}/${env.DOCKER_IMAGE}:${env.DOCKER_TAG} .
                                docker push ${env.DOCKER_REGISTRY}/${env.DOCKER_IMAGE}:${env.DOCKER_TAG}
                                
                                docker tag ${env.DOCKER_REGISTRY}/${env.DOCKER_IMAGE}:${env.DOCKER_TAG} ${env.DOCKER_REGISTRY}/${env.DOCKER_IMAGE}:latest
                                docker push ${env.DOCKER_REGISTRY}/${env.DOCKER_IMAGE}:latest
                            """
                        }
                    }
                }
            }
        }
        
        stage('Deploy Docker Container') {
            steps {
                script {
                    // Arrêter et supprimer le conteneur existant s'il existe
                    sh """
                        docker stop ${env.CONTAINER_NAME} || true
                        docker rm ${env.CONTAINER_NAME} || true
                    """
                    
                    // Lancer un nouveau conteneur
                    sh """
                        docker run -d \
                            --name ${env.CONTAINER_NAME} \
                            -p ${env.SERVICE_PORT}:${env.SERVICE_PORT} \
                            -e NODE_ENV=production \
                            ${env.DOCKER_REGISTRY}/${env.DOCKER_IMAGE}:${env.DOCKER_TAG}
                    """
                    
                    // Vérifier que le conteneur est en cours d'exécution
                    sh """
                        echo "=== Liste des conteneurs ==="
                        docker ps -a
                        
                        echo "=== Logs du conteneur ==="
                        sleep 5
                        docker logs ${env.CONTAINER_NAME} --tail 50
                    """
                    
                    // Optionnel: faire un test de santé
                    sh """
                        echo "=== Test de santé ==="
                        curl -I http://localhost:${env.SERVICE_PORT}/health || true
                    """
                }
            }
           // post {
             //   always {
                    // Nettoyage - vous pouvez commenter ces lignes si vous voulez garder le conteneur
                   // sh """
                        //docker stop ${env.CONTAINER_NAME} || true
                       // docker rm ${env.CONTAINER_NAME} || true
                  //  """
            ////    }
          //  }
     /   }
        
        stage('Verify Kubernetes Access') {
            steps {
                script {
                    sh """
                        echo "=== Vérification de l'accès au cluster ==="
                        kubectl cluster-info
                        kubectl get nodes
                    """
                }
            }
        }
        
        stage('Deploy to Kubernetes (k3s)') {
            when {
                expression { 
                    fileExists('k8s/deployment.yaml') && 
                    fileExists('k8s/service.yaml') &&
                    fileExists('k8s/secret.yaml')
                }
            }
            steps {
                script {
                    // 1. Préparation
                    sh """
                        echo "=== Structure des fichiers K8s ==="
                        pwd && ls -la k8s/
                    """
                    
                    // 2. Configuration du namespace
                    sh """
                        kubectl create namespace ${env.KUBE_NAMESPACE} || true
                    """
                    
                    // 3. Déploiement des ressources
                    sh """
                        kubectl apply -f k8s/secret.yaml -n ${env.KUBE_NAMESPACE}
                        sed -i "s|image: .*|image: ${env.DOCKER_REGISTRY}/${env.DOCKER_IMAGE}:${env.DOCKER_TAG}|g" k8s/deployment.yaml
                        kubectl apply -f k8s/deployment.yaml -n ${env.KUBE_NAMESPACE}
                        kubectl apply -f k8s/service.yaml -n ${env.KUBE_NAMESPACE}
                    """
                    
                    // 4. Vérification détaillée
                    sh """
                        echo "\\n=== État complet du déploiement ==="
                        kubectl get all -n ${env.KUBE_NAMESPACE}
                        
                        echo "\\n=== Détails des Pods ==="
                        kubectl get pods -n ${env.KUBE_NAMESPACE} -o wide
                        kubectl describe pods -n ${env.KUBE_NAMESPACE} -l app=microservice-paiement
                        
                        echo "\\n=== Détails des Services ==="
                        kubectl get svc -n ${env.KUBE_NAMESPACE}
                        kubectl describe svc microservice-paiement -n ${env.KUBE_NAMESPACE}
                        
                        echo "\\n=== Logs initiaux ==="
                        kubectl logs -n ${env.KUBE_NAMESPACE} -l app=microservice-paiement --tail=50
                    """
                    
                    // 5. Vérification de santé
                    sh """
                        echo "\\n=== Vérification de la santé ==="
                        kubectl rollout status deployment/microservice-paiement -n ${env.KUBE_NAMESPACE} --timeout=120s
                    """
                }
            }
            post {
                failure {
                    script {
                        echo "❌ Échec du déploiement - Début du rollback"
                        sh """
                            echo "=== État avant rollback ==="
                            kubectl get all -n ${env.KUBE_NAMESPACE}
                            
                            echo "=== Tentative de rollback ==="
                            kubectl rollout undo deployment/microservice-paiement -n ${env.KUBE_NAMESPACE}
                            
                            echo "=== Nettoyage ==="
                            kubectl delete -f k8s/deployment.yaml -n ${env.KUBE_NAMESPACE} || true
                            kubectl delete -f k8s/service.yaml -n ${env.KUBE_NAMESPACE} || true
                            
                            echo "=== État après rollback ==="
                            kubectl get all -n ${env.KUBE_NAMESPACE}
                        """
                    }
                }
            }
        }
    }
    
    post {
        always {
            script {
                cleanWs()
                currentBuild.description = "v${env.BUILD_NUMBER}"
            }
        }
        success {
            script {
                echo """
                ✅ Déploiement réussi!
                Image: ${env.DOCKER_REGISTRY}/${env.DOCKER_IMAGE}:${env.DOCKER_TAG}
                Namespace: ${env.KUBE_NAMESPACE}
                Accès: kubectl port-forward svc/microservice-paiement 3002:3002 -n ${env.KUBE_NAMESPACE}
                """
            }
        }
        failure {
            script {
                echo '❌ Échec du pipeline'
                sh """
                    docker stop ${env.CONTAINER_NAME} || true
                    docker rm ${env.CONTAINER_NAME} || true
                    kubectl delete -f k8s/deployment.yaml -n ${env.KUBE_NAMESPACE} || true
                    kubectl delete -f k8s/service.yaml -n ${env.KUBE_NAMESPACE} || true
                """
            }
        }
    }
}