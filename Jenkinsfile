pipeline {
    agent any

    environment {
        NODE_ENV = 'test'
        SKIP_DB_CONNECTION = 'true'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Setup Node.js') {
            steps {
                script {
                    def nodeVersion = sh(returnStdout: true, script: 'node --version').trim()
                    def npmVersion = sh(returnStdout: true, script: 'npm --version').trim()
                    echo "Using Node ${nodeVersion} and npm ${npmVersion}"
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

        stage('Build') {
            steps {
                dir('backend') {
                    sh 'npm run build'
                    script {
                        // Vérification des artefacts de build
                        if (fileExists('dist')) {
                            echo "Build artefacts found in dist/"
                            archiveArtifacts artifacts: 'dist/**/*'
                        } else {
                            echo "No build artefacts directory found (simple project)"
                        }
                    }
                }
            }
        }

        stage('Run Tests') {
            steps {
                dir('backend') {
                    sh 'npm run test:ci'  // Utilise la commande CI spécifique
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
                    archiveArtifacts artifacts: 'backend/coverage/**/*'
                }
            }
        }

        stage('Security Check') {
            steps {
                dir('backend') {
                    catchError(buildResult: 'UNSTABLE', stageResult: 'FAILURE') {
                        sh 'npm audit --audit-level=moderate'
                    }
                }
            }
        }
    }

    post {
        always {
            cleanWs()
            script {
                currentBuild.description = "v${env.BUILD_NUMBER} | Node ${sh(returnStdout: true, script: 'node --version').trim()}"
            }
        }
        success {
            slackSend(
                channel: '#devops',
                message: "✅ Microservice Paiement - Build #${env.BUILD_NUMBER} Success\n${env.BUILD_URL}"
            )
        }
        failure {
            slackSend(
                channel: '#devops',
                message: "❌ Microservice Paiement - Build #${env.BUILD_NUMBER} Failed\n${env.BUILD_URL}"
            )
        }
    }

    options {
        timeout(time: 15, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '5'))
        skipDefaultCheckout(false)
    }
}