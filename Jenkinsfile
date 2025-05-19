pipeline {
    agent any
    
    environment {
        NODE_ENV = 'test'
        SKIP_DB_CONNECTION = 'true'
    }
    
    stages {
        stage('Install & Test') {
            steps {
                checkout scm
                sh 'npm ci --prefer-offline'
                sh 'npm test'
            }
        }
    }
    
    post {
        always {
            cleanWs()
        }
    }
}