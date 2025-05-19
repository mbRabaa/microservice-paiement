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
                    // Installation spécifique de jest-junit
                    sh 'npm install --save-dev jest-junit'
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
                    // Commande de test modifiée avec le bon reporter
                    sh '''
                        mkdir -p test-results
                        NODE_ENV=test SKIP_DB_CONNECTION=true jest \
                          --ci \
                          --coverage \
                          --reporters=default \
                          --reporters=jest-junit \
                          --testResultsProcessor="jest-junit"
                    '''
                }
            }
            post {
                always {
                    junit 'backend/test-results/junit.xml'
                    // Vérification de l'existence du répertoire avant publication
                    script {
                        if (fileExists('backend/coverage/lcov-report/index.html')) {
                            publishHTML(target: [
                                reportDir: 'backend/coverage/lcov-report',
                                reportFiles: 'index.html',
                                reportName: 'Coverage Report'
                            ])
                        } else {
                            echo "Le rapport de couverture n'existe pas, skip..."
                        }
                    }
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
                                docker login -u $DOCKER_USER -p $DOCKER_PASS
                                docker build -t ${env.DOCKER_IMAGE}:${env.DOCKER_TAG} .
                                docker tag ${env.DOCKER_IMAGE}:${env.DOCKER_TAG} ${env.DOCKER_REGISTRY}/${env.DOCKER_IMAGE}:${env.DOCKER_TAG}
                                docker push ${env.DOCKER_REGISTRY}/${env.DOCKER_IMAGE}:${env.DOCKER_TAG}
                                
                                docker tag ${env.DOCKER_IMAGE}:${env.DOCKER_TAG} ${env.DOCKER_REGISTRY}/${env.DOCKER_IMAGE}:latest
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
                    sh "docker stop ${env.CONTAINER_NAME} || true"
                    sh "docker rm ${env.CONTAINER_NAME} || true"
                    
                    sh """
                        docker run -d \
                            --name ${env.CONTAINER_NAME} \
                            -p ${env.SERVICE_PORT}:${env.SERVICE_PORT} \
                            -e NODE_ENV=production \
                            -e PORT=${env.SERVICE_PORT} \
                            ${env.DOCKER_IMAGE}:${env.DOCKER_TAG}
                    """
                    
                    sleep 5
                    sh "docker logs ${env.CONTAINER_NAME}"
                }
            }
        }
        
        stage('Health Check') {
            steps {
                script {
                    sh """
                        attempts=0
                        max_attempts=30
                        while ! curl -f -s http://localhost:${env.SERVICE_PORT}/api/health; do
                            if [ \$attempts -eq \$max_attempts ]; then
                                echo "Le service ne répond pas après \$max_attempts tentatives"
                                exit 1
                            fi
                            attempts=\$((attempts+1))
                            sleep 2
                        done
                        echo "✅ Health check passed"
                    """
                }
            }
        }
    }
    
    post {
        always {
            script {
                archiveArtifacts artifacts: '**/test-results/*.xml', allowEmptyArchive: true
                cleanWs()
                currentBuild.description = "v${env.BUILD_NUMBER}"
            }
        }
        success {
            script {
                echo """
                ✅ Déploiement réussi!
                URL: http://localhost:${env.SERVICE_PORT}
                Image: ${env.DOCKER_REGISTRY}/${env.DOCKER_IMAGE}:${env.DOCKER_TAG}
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