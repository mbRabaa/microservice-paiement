pipeline {
    agent any
    
    environment {
        NODE_ENV = 'test'
        SKIP_DB_CONNECTION = 'true'
        JEST_JUNIT_OUTPUT = 'test-results/junit.xml'
    }
    
    options {
        skipDefaultCheckout(true) // Évite le double checkout
        timeout(time: 15, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '5'))
    }
    
    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        
        stage('Setup Node.js') {
            steps {
                sh 'node --version'
                sh 'npm --version'
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
    }
    
    post {
        always {
            cleanWs()
            script {
                currentBuild.description = "Build #${env.BUILD_NUMBER}"
            }
        }
    }
}