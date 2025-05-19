pipeline {
    agent any
    
    environment {
        NODE_ENV = 'test'
        SKIP_DB_CONNECTION = 'true'
        JEST_JUNIT_OUTPUT = 'test-results/junit.xml'
        DOCKER_IMAGE = 'microservice-paiement'
        DOCKER_REGISTRY = 'docker.io/mbrabaa2023' 
        DOCKER_TAG = "${env.BUILD_NUMBER}-${env.GIT_COMMIT.take(7)}"
    }
    
    options {
        skipDefaultCheckout(true)
        timeout(time: 30, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '5'))
    }
    
    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        
        stage('Setup Environment') {
            steps {
                sh 'node --version'
                sh 'npm --version'
                sh 'docker --version'
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
        
        stage('Build Docker Image') {
            steps {
                dir('backend') {
                    script {
                        // Vérification que le Dockerfile existe bien
                        if (!fileExists('Dockerfile')) {
                            error("Dockerfile non trouvé dans le dossier backend")
                        }
                        
                        // Build et push de l'image Docker
                        docker.withRegistry("https://${env.DOCKER_REGISTRY}", 'docker-hub-creds') {
                            def customImage = docker.build(
                                "${env.DOCKER_REGISTRY}/${env.DOCKER_IMAGE}:${env.DOCKER_TAG}"
                            )
                            customImage.push()
                            
                            // Tag supplémentaire 'latest'
                            docker.image("${env.DOCKER_REGISTRY}/${env.DOCKER_IMAGE}:${env.DOCKER_TAG}").tag('latest')
                            docker.image("${env.DOCKER_REGISTRY}/${env.DOCKER_IMAGE}:latest").push()
                        }
                    }
                }
            }
        }
    }
    
    post {
        always {
            cleanWs()
            script {
                currentBuild.description = "v${env.BUILD_NUMBER} | ${env.GIT_COMMIT.take(7)}"
            }
        }
        success {
            echo """
            ✅ Build réussi!
            Image Docker: ${env.DOCKER_REGISTRY}/${env.DOCKER_IMAGE}:${env.DOCKER_TAG}
            """
            // Pour copier-coller la commande pull
            echo """
            Pour tester l'image localement:
            docker pull ${env.DOCKER_REGISTRY}/${env.DOCKER_IMAGE}:${env.DOCKER_TAG}
            """
        }
        failure {
            echo '❌ Échec du pipeline'
        }
    }
}