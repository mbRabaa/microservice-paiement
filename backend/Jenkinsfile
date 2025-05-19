pipeline {
    agent any
    
    environment {
        NODE_ENV = 'test'
        SKIP_DB_CONNECTION = 'true'
        // Pour Jest/JUnit reports
        JEST_JUNIT_OUTPUT_DIR = 'test-results'
        JEST_JUNIT_OUTPUT_NAME = 'junit.xml'
    }
    
    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        
        stage('Install Dependencies') {
            steps {
                sh 'npm ci --prefer-offline' // Plus fiable que npm install
            }
        }
        
        stage('Build') {
            steps {
                sh 'npm run build' // Doit exister dans package.json
                archiveArtifacts artifacts: 'dist/**/*' // Si build génère un dossier dist
            }
        }
        
        stage('Unit Tests') {
            steps {
                sh 'npm test'
            }
            post {
                always {
                    junit 'test-results/junit.xml' // Capture des résultats
                    archiveArtifacts artifacts: 'coverage/**/*' // Si couverture de code
                }
            }
        }
    }
    
    post {
        always {
            cleanWs()
        }
        success {
            slackSend channel: '#devops',
                     color: 'good',
                     message: "SUCCESS: ${env.JOB_NAME} #${env.BUILD_NUMBER}"
        }
        failure {
            slackSend channel: '#devops',
                     color: 'danger',
                     message: "FAILED: ${env.JOB_NAME} #${env.BUILD_NUMBER}"
        }
    }
}
