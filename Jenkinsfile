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
        KUBE_CONFIG_FILE = '/home/jenkins/.kube/config'
        K8S_DEPLOYMENT_FILE = 'k8s/deployment.yaml'
        K8S_SERVICE_FILE = 'k8s/service.yaml'
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
                                
                                # Tag latest
                                docker tag ${env.DOCKER_REGISTRY}/${env.DOCKER_IMAGE}:${env.DOCKER_TAG} ${env.DOCKER_REGISTRY}/${env.DOCKER_IMAGE}:latest
                                docker push ${env.DOCKER_REGISTRY}/${env.DOCKER_IMAGE}:latest
                            """
                        }
                    }
                }
            }
        }
        
        stage('Deploy to Kubernetes (k3s)') {
            when {
                expression { 
                    fileExists('k8s/deployment.yaml') && 
                    fileExists('k8s/service.yaml') &&
                    fileExists('k8s/secret.yaml') &&
                    fileExists('k8s/configmap.yaml')
                }
            }
            steps {
                dir('backend') {
                    script {
                        // Vérification de l'accès à Kubernetes
                        sh """
                            kubectl --kubeconfig=${env.KUBE_CONFIG_FILE} cluster-info
                            kubectl --kubeconfig=${env.KUBE_CONFIG_FILE} get nodes
                        """
                        
                        // Application des configurations de base
                        sh """
                            kubectl --kubeconfig=${env.KUBE_CONFIG_FILE} apply -f k8s/configmap.yaml -n ${env.KUBE_NAMESPACE}
                            kubectl --kubeconfig=${env.KUBE_CONFIG_FILE} apply -f k8s/secret.yaml -n ${env.KUBE_NAMESPACE}
                        """
                        
                        // Mise à jour de l'image Docker
                        sh """
                            sed -i "s|image: .*|image: ${env.DOCKER_REGISTRY}/${env.DOCKER_IMAGE}:${env.DOCKER_TAG}|g" ${env.K8S_DEPLOYMENT_FILE}
                        """
                        
                        // Déploiement Kubernetes
                        sh """
                            kubectl --kubeconfig=${env.KUBE_CONFIG_FILE} apply -f ${env.K8S_DEPLOYMENT_FILE} -n ${env.KUBE_NAMESPACE}
                            kubectl --kubeconfig=${env.KUBE_CONFIG_FILE} apply -f ${env.K8S_SERVICE_FILE} -n ${env.KUBE_NAMESPACE}
                        """
                        
                        // Vérification du déploiement
                        sh """
                            echo "=== État du déploiement ==="
                            kubectl --kubeconfig=${env.KUBE_CONFIG_FILE} get deployments -n ${env.KUBE_NAMESPACE}
                            kubectl --kubeconfig=${env.KUBE_CONFIG_FILE} get pods -n ${env.KUBE_NAMESPACE} -l app=${env.DOCKER_IMAGE}
                            kubectl --kubeconfig=${env.KUBE_CONFIG_FILE} get svc -n ${env.KUBE_NAMESPACE} -l app=${env.DOCKER_IMAGE}
                            
                            echo "=== Logs des pods ==="
                            kubectl --kubeconfig=${env.KUBE_CONFIG_FILE} logs -n ${env.KUBE_NAMESPACE} -l app=${env.DOCKER_IMAGE} --tail=50
                        """
                        
                        // Attente que le déploiement soit prêt
                        sh """
                            kubectl --kubeconfig=${env.KUBE_CONFIG_FILE} rollout status deployment/microservice-paiement -n ${env.KUBE_NAMESPACE} --timeout=300s
                        """
                        
                        // Affichage des informations d'accès
                        sh """
                            echo "=== Informations d'accès ==="
                            echo "NodePort: 30089"
                            echo "Pour accéder au service:"
                            echo "kubectl port-forward svc/microservice-paiement 3002:3002 -n ${env.KUBE_NAMESPACE} &"
                            echo "curl http://localhost:3002/api/health"
                        """
                    }
                }
            }
            post {
                failure {
                    script {
                        echo "❌ Échec du déploiement Kubernetes - Tentative de rollback"
                        sh """
                            kubectl --kubeconfig=${env.KUBE_CONFIG_FILE} rollout undo deployment/microservice-paiement -n ${env.KUBE_NAMESPACE}
                        """
                    }
                }
            }
        }
    }
    
    post {
        always {
            script {
                if (env.NODE_NAME != null) {
                    cleanWs()
                }
                currentBuild.description = "v${env.BUILD_NUMBER}"
            }
        }
        success {
            script {
                echo """
                ✅ Build réussi!
                Image Docker: ${env.DOCKER_REGISTRY}/${env.DOCKER_IMAGE}:${env.DOCKER_TAG}
                Namespace Kubernetes: ${env.KUBE_NAMESPACE}
                Service NodePort: 30082
                """
            }
        }
        failure {
            script {
                echo '❌ Échec du pipeline'
                // Nettoyage des ressources
                sh "docker stop ${env.CONTAINER_NAME} || true"
                sh "docker rm ${env.CONTAINER_NAME} || true"
                sh """
                    kubectl --kubeconfig=${env.KUBE_CONFIG_FILE} delete -f ${env.K8S_DEPLOYMENT_FILE} -n ${env.KUBE_NAMESPACE} || true
                    kubectl --kubeconfig=${env.KUBE_CONFIG_FILE} delete -f ${env.K8S_SERVICE_FILE} -n ${env.KUBE_NAMESPACE} || true
                """
            }
        }
    }
}