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
        
        stage('Verify Kubernetes Access') {
            steps {
                script {
                    try {
                        sh """
                            echo "=== Vérification du fichier KUBECONFIG ==="
                            ls -la ${env.KUBECONFIG}
                            
                            echo "=== Test de connexion avec KUBECONFIG ==="
                            KUBECONFIG=${env.KUBECONFIG} kubectl cluster-info
                            
                            echo "=== Vérification des accès ==="
                            KUBECONFIG=${env.KUBECONFIG} kubectl get nodes
                            
                            echo "=== Vérification du namespace ==="
                            KUBECONFIG=${env.KUBECONFIG} kubectl get namespace ${env.KUBE_NAMESPACE} || \
                            KUBECONFIG=${env.KUBECONFIG} kubectl create namespace ${env.KUBE_NAMESPACE}
                        """
                    } catch (Exception e) {
                        error("Erreur d'accès au cluster Kubernetes: ${e.message}\n" +
                              "Vérifiez que:\n" +
                              "1. Le fichier KUBECONFIG est valide\n" +
                              "2. Le cluster est accessible depuis Jenkins\n" +
                              "3. Les credentials Jenkins sont à jour")
                    }
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
                    try {
                        // 1. Préparation
                        sh """
                            echo "=== Structure des fichiers K8s ==="
                            ls -la k8s/
                            
                            echo "=== Vérification des fichiers YAML ==="
                            test -f k8s/deployment.yaml || exit 1
                            test -f k8s/service.yaml || exit 1
                            test -f k8s/secret.yaml || exit 1
                        """
                        
                        // 2. Configuration du namespace
                        sh """
                            KUBECONFIG=${env.KUBECONFIG} kubectl create namespace ${env.KUBE_NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -
                        """
                        
                        // 3. Déploiement des ressources
                        sh """
                            echo "=== Application des secrets ==="
                            KUBECONFIG=${env.KUBECONFIG} kubectl apply -f k8s/secret.yaml -n ${env.KUBE_NAMESPACE}
                            
                            echo "=== Mise à jour de l'image dans deployment.yaml ==="
                            sed -i "s|image: .*|image: ${env.DOCKER_REGISTRY}/${env.DOCKER_IMAGE}:${env.DOCKER_TAG}|g" k8s/deployment.yaml
                            
                            echo "=== Déploiement de l'application ==="
                            KUBECONFIG=${env.KUBECONFIG} kubectl apply -f k8s/deployment.yaml -n ${env.KUBE_NAMESPACE}
                            KUBECONFIG=${env.KUBECONFIG} kubectl apply -f k8s/service.yaml -n ${env.KUBE_NAMESPACE}
                        """
                        
                        // 4. Vérification détaillée
                        sh """
                            echo "\\n=== État complet du déploiement ==="
                            KUBECONFIG=${env.KUBECONFIG} kubectl get all -n ${env.KUBE_NAMESPACE}
                            
                            echo "\\n=== Détails des Pods ==="
                            KUBECONFIG=${env.KUBECONFIG} kubectl get pods -n ${env.KUBE_NAMESPACE} -o wide
                            KUBECONFIG=${env.KUBECONFIG} kubectl describe pods -n ${env.KUBE_NAMESPACE} -l app=microservice-paiement
                            
                            echo "\\n=== Détails des Services ==="
                            KUBECONFIG=${env.KUBECONFIG} kubectl get svc -n ${env.KUBE_NAMESPACE}
                            KUBECONFIG=${env.KUBECONFIG} kubectl describe svc microservice-paiement -n ${env.KUBE_NAMESPACE}
                            
                            echo "\\n=== Attente du déploiement ==="
                            KUBECONFIG=${env.KUBECONFIG} kubectl rollout status deployment/microservice-paiement -n ${env.KUBE_NAMESPACE} --timeout=120s
                            
                            echo "\\n=== Logs initiaux ==="
                            KUBECONFIG=${env.KUBECONFIG} kubectl logs -n ${env.KUBE_NAMESPACE} -l app=microservice-paiement --tail=50
                        """
                    } catch (Exception e) {
                        error("Erreur lors du déploiement Kubernetes: ${e.message}")
                    }
                }
            }
            post {
                failure {
                    script {
                        echo "❌ Échec du déploiement - Début du rollback"
                        try {
                            sh """
                                echo "=== Tentative de rollback ==="
                                KUBECONFIG=${env.KUBECONFIG} kubectl rollout undo deployment/microservice-paiement -n ${env.KUBE_NAMESPACE} || true
                                
                                echo "=== Nettoyage ==="
                                KUBECONFIG=${env.KUBECONFIG} kubectl delete -f k8s/deployment.yaml -n ${env.KUBE_NAMESPACE} --ignore-not-found=true
                                KUBECONFIG=${env.KUBECONFIG} kubectl delete -f k8s/service.yaml -n ${env.KUBE_NAMESPACE} --ignore-not-found=true
                                
                                echo "=== État après rollback ==="
                                KUBECONFIG=${env.KUBECONFIG} kubectl get all -n ${env.KUBE_NAMESPACE}
                            """
                        } catch (Exception e) {
                            echo "⚠️ Erreur lors du rollback: ${e.message}"
                        }
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
                try {
                    sh """
                        docker stop ${env.CONTAINER_NAME} || true
                        docker rm ${env.CONTAINER_NAME} || true
                        KUBECONFIG=${env.KUBECONFIG} kubectl delete -f k8s/deployment.yaml -n ${env.KUBE_NAMESPACE} --ignore-not-found=true
                        KUBECONFIG=${env.KUBECONFIG} kubectl delete -f k8s/service.yaml -n ${env.KUBE_NAMESPACE} --ignore-not-found=true
                    """
                } catch (Exception e) {
                    echo "⚠️ Erreur lors du nettoyage: ${e.message}"
                }
            }
        }
    }
}