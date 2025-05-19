pipeline {
    agent any
    
    environment {
        NODE_ENV = 'production'
        SKIP_DB_CONNECTION = 'true'
        JEST_JUNIT_OUTPUT = 'test-results/junit.xml'
        DOCKER_IMAGE = 'microservice-paiement'
        DOCKER_REGISTRY = 'docker.io/mbrabaa2023'
        DOCKER_TAG = "${env.BUILD_NUMBER}-${env.GIT_COMMIT?.take(7) ?: 'unknown'}"
        CONTAINER_NAME = 'microservice-paiement-container'
        SERVICE_PORT = '3002'
        APP_HOST = '0.0.0.0'
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
        
        stage('Deploy Container') {
            steps {
                script {
                    // Nettoyage des anciens conteneurs
                    sh "docker stop ${env.CONTAINER_NAME} || true"
                    sh "docker rm ${env.CONTAINER_NAME} || true"
                    
                    // Démarrage du conteneur avec toutes les variables nécessaires
                    sh """
                        docker run -d \
                            --name ${env.CONTAINER_NAME} \
                            -p ${env.SERVICE_PORT}:${env.SERVICE_PORT} \
                            -e NODE_ENV=${env.NODE_ENV} \
                            -e PORT=${env.SERVICE_PORT} \
                            -e SKIP_DB_CONNECTION=${env.SKIP_DB_CONNECTION} \
                            -e APP_HOST=${env.APP_HOST} \
                            ${env.DOCKER_REGISTRY}/${env.DOCKER_IMAGE}:${env.DOCKER_TAG}
                    """
                    
                    // Attente et vérification
                    sleep 5
                    sh "docker ps -a | grep ${env.CONTAINER_NAME}"
                    sh "docker logs ${env.CONTAINER_NAME}"
                }
            }
        }
        
        stage('Health Check') {
            steps {
                script {
                    // Vérification complète de la santé de l'application
                    sh """
                        attempts=0
                        max_attempts=30
                        while true; do
                            response=\$(curl -s http://localhost:${env.SERVICE_PORT}/api/health || echo "FAIL")
                            if echo "\$response" | grep -q '"success":true'; then
                                echo "Health check successful: \$response"
                                break
                            fi
                            
                            if [ \$attempts -eq \$max_attempts ]; then
                                echo "Échec du health check après \$max_attempts tentatives"
                                echo "Dernière réponse: \$response"
                                docker logs ${env.CONTAINER_NAME}
                                exit 1
                            fi
                            
                            echo "Tentative \$((attempts+1))/\$max_attempts - Service pas encore prêt"
                            attempts=\$((attempts+1))
                            sleep 3
                        done
                    """
                    
                    // Test supplémentaire des endpoints
                    sh """
                        echo "Test des endpoints disponibles:"
                        curl -v http://localhost:${env.SERVICE_PORT}/api/health
                        curl -v http://localhost:${env.SERVICE_PORT}/api/paiements -X POST -H "Content-Type: application/json" -d '{"montant": 100}'
                    """
                }
            }
        }
    }
    
    post {
        always {
            script {
                // Archivage des logs en cas d'échec
                sh "docker logs ${env.CONTAINER_NAME} > container_logs.txt || true"
                archiveArtifacts artifacts: 'container_logs.txt', onlyIfFailed: true
                
                // Nettoyage
                if (env.NODE_NAME != null) {
                    cleanWs()
                }
                currentBuild.description = "v${env.BUILD_NUMBER}"
            }
        }
        success {
            script {
                echo """
                ✅ Déploiement réussi!
                URL: http://localhost:${env.SERVICE_PORT}
                Image: ${env.DOCKER_REGISTRY}/${env.DOCKER_IMAGE}:${env.DOCKER_TAG}
                Conteneur: ${env.CONTAINER_NAME}
                """
            }
        }
        failure {
            script {
                echo '❌ Échec du pipeline'
                sh "docker stop ${env.CONTAINER_NAME} || true"
                sh "docker rm ${env.CONTAINER_NAME} || true"
            }
        }
    }
}