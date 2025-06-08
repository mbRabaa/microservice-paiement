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
        // Modification importante: utilisation d'un fichier temporaire pour KUBECONFIG
        KUBECONFIG = "${WORKSPACE}/kubeconfig"
    }
    
    options {
        timeout(time: 30, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '5'))
    }
    
    stages {
        stage('Preparation') {
            steps {
                script {
                    // Création du fichier kubeconfig à partir des credentials
                    withCredentials([file(credentialsId: 'k3s-jenkins-config', variable: 'KUBECONFIG_FILE')]) {
                        sh """
                            cp ${KUBECONFIG_FILE} ${env.KUBECONFIG}
                            chmod 600 ${env.KUBECONFIG}
                        """
                    }
                }
            }
        }

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
                            kubectl --kubeconfig=${env.KUBECONFIG} cluster-info
                            
                            echo "=== Vérification des accès ==="
                            kubectl --kubeconfig=${env.KUBECONFIG} get nodes
                            
                            echo "=== Vérification du namespace ==="
                            kubectl --kubeconfig=${env.KUBECONFIG} get namespace ${env.KUBE_NAMESPACE} || \
                            kubectl --kubeconfig=${env.KUBECONFIG} create namespace ${env.KUBE_NAMESPACE}
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
                        sh """
                            echo "=== Structure des fichiers K8s ==="
                            ls -la k8s/
                            
                            echo "=== Application des secrets ==="
                            kubectl --kubeconfig=${env.KUBECONFIG} apply -f k8s/secret.yaml -n ${env.KUBE_NAMESPACE}
                            
                            echo "=== Mise à jour de l'image dans deployment.yaml ==="
                            sed -i "s|image: .*|image: ${env.DOCKER_REGISTRY}/${env.DOCKER_IMAGE}:${env.DOCKER_TAG}|g" k8s/deployment.yaml
                            
                            echo "=== Déploiement de l'application ==="
                            kubectl --kubeconfig=${env.KUBECONFIG} apply -f k8s/deployment.yaml -n ${env.KUBE_NAMESPACE}
                            kubectl --kubeconfig=${env.KUBECONFIG} apply -f k8s/service.yaml -n ${env.KUBE_NAMESPACE}
                            
                            echo "=== Attente du déploiement ==="
                            kubectl --kubeconfig=${env.KUBECONFIG} rollout status deployment/microservice-paiement -n ${env.KUBE_NAMESPACE} --timeout=120s
                        """
                    } catch (Exception e) {
                        error("Erreur lors du déploiement Kubernetes: ${e.message}")
                    }
                }
            }
        }
    }
    
    post {
        always {
            script {
                // Nettoyage du fichier kubeconfig
                sh "rm -f ${env.KUBECONFIG} || true"
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
                    kubectl --kubeconfig=${env.KUBECONFIG} delete -f k8s/deployment.yaml -n ${env.KUBE_NAMESPACE} --ignore-not-found=true || true
                    kubectl --kubeconfig=${env.KUBECONFIG} delete -f k8s/service.yaml -n ${env.KUBE_NAMESPACE} --ignore-not-found=true || true
                """
            }
        }
    }
}