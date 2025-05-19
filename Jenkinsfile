pipeline {
    agent any
    
    environment {
        NODE_ENV = 'test'
        SKIP_DB_CONNECTION = 'true'
        JEST_JUNIT_OUTPUT_DIR = 'test-results'
        JEST_JUNIT_OUTPUT_NAME = 'test-results.xml'
    }
    
    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        
        stage('Install Dependencies') {
            steps {
                sh 'npm ci --prefer-offline --audit false'
                sh 'npm list' // Vérification visuelle des dépendances
            }
        }
        
        stage('Build Verification') {
            steps {
                sh 'npm run build' // Exécute votre script echo + tsc
                script {
                    if (fileExists('dist')) {
                        echo "Build artifacts detected in dist/"
                    } else {
                        echo "No build artifacts generated (expected for this project)"
                    }
                }
            }
        }
        
        stage('Unit Tests') {
            steps {
                sh 'npm test' // Exécute Jest avec votre configuration
            }
            post {
                always {
                    junit 'test-results/test-results.xml' // Rapport JUnit
                    archiveArtifacts artifacts: 'test-results/**/*' // Archivage des résultats
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
            echo '✅ Pipeline exécuté avec succès'
            // Ici vous pourriez ajouter des notifications (Slack/Email)
        }
        failure {
            echo '❌ Pipeline en échec - Consultez les logs'
        }
    }
    
    options {
        timeout(time: 15, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '10'))
        disableConcurrentBuilds()
    }
}