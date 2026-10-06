pipeline {

    agent any

    environment {

        AWS_REGION = 'ap-south-1'

        PROJECT_NAME = 'vms360'

        AWS_ACCESS_KEY_ID = credentials('aws-access-key-id')
        AWS_SECRET_ACCESS_KEY = credentials('aws-secret-access-key')
        AWS_ACCOUNT_ID = credentials('aws-rahul-account-id')

        S3_ENV_BUCKET = 'its360-secure-env-file'

        CODEBUILD_PROJECT_NAME = 'vms360-build'

        FRONTEND_ECR_REPOSITORY = 'vms360-frontend'
        BACKEND_ECR_REPOSITORY  = 'vms360-backend'

        ECS_CLUSTER = 'its360-cluster'

        GITHUB_PAT = credentials('hrms-git-token')

        GIT_REPO = "https://${GITHUB_PAT}@github.com/rahulahirwal-itsoftlab/VMS.git"

        BACKEND_PRODUCTION_ENV_S3_KEY = 'vms-360-backend-production-env'
        FRONTEND_PRODUCTION_ENV_S3_KEY = 'vms-360-frontend-production-env'
        BACKEND_STAGING_ENV_S3_KEY = 'vms-360-backend-staging-env'
        FRONTEND_STAGING_ENV_S3_KEY = 'vms-360-frontend-staging-env'

    }

    stages {

        stage('Validate Git Tag') {
            steps {
                script {
                    env.TAG_NAME = sh(script: 'git tag --points-at HEAD | sort -V | tail -n 1 || echo ""', returnStdout: true).trim()
                    if (!env.TAG_NAME) {
                        error '❌ No tag detected! Deployment only triggers on tag creation.'
                    }
                    echo "📌 Detected Tag: ${env.TAG_NAME}"

                    env.BRANCH = sh(script: "git branch -r --contains ${env.TAG_NAME} | grep -Eo 'origin/(main|staging)' | head -n 1 | cut -d '/' -f2 || echo ''", returnStdout: true).trim()
                    if (!env.BRANCH) {
                        error "❌ Invalid tag! Tags must be from 'main', 'staging' branches."
                    }

                    if (env.BRANCH == 'main' && env.TAG_NAME ==~ /^v\d+\.\d+\.\d+$/) {
                        env.ENVIRONMENT = 'production'
                    } else if (env.BRANCH == 'staging' && env.TAG_NAME ==~ /^v\d+\.\d+\.\d+-staging$/) {
                        env.ENVIRONMENT = 'staging'
                    } else {
                        error "❌ Invalid tag format for branch '${env.BRANCH}'."
                    }
                    echo "🌍 Deployment Environment: ${env.ENVIRONMENT}"
                    echo "Project: ${PROJECT_NAME}"
                    echo "Branch: ${env.BRANCH}"
                    echo "Tag: ${env.TAG_NAME}"
                }
            }
        }

        stage('Create Docker Tags') {
            steps {
                script {
                    env.BACKEND_TAG = "backend-${env.ENVIRONMENT}-${env.TAG_NAME}"
                    env.FRONTEND_TAG = "frontend-${env.ENVIRONMENT}-${env.TAG_NAME}"
                    echo "🛠️ Backend Tag: ${env.BACKEND_TAG}"
                    echo "🛠️ Frontend Tag: ${env.FRONTEND_TAG}"
                }
            }
        }

        stage('Determine secret key file') {
            steps {
                script {
                    if (!env.ENVIRONMENT) {
                        error "❌ Secret key determination failed. ENVIRONMENT is not available."
                    }
                    if (env.ENVIRONMENT == 'production') {
                        env.BACKEND_SECRET_KEY = "${env.BACKEND_PRODUCTION_ENV_S3_KEY}.env"
                        env.FRONTEND_SECRET_KEY = "${env.FRONTEND_PRODUCTION_ENV_S3_KEY}.env"
                    } else if (env.ENVIRONMENT == 'staging') {
                        env.BACKEND_SECRET_KEY = "${env.BACKEND_STAGING_ENV_S3_KEY}.env"
                        env.FRONTEND_SECRET_KEY = "${env.FRONTEND_STAGING_ENV_S3_KEY}.env"
                    } else {
                        error "❌ Unknown deployment environment: ${env.ENVIRONMENT}"
                    }
                    echo "🔐 Backend env file: ${env.BACKEND_SECRET_KEY}"
                    echo "🔐 Frontend env file: ${env.FRONTEND_SECRET_KEY}"
                }
            }
        }

        stage('Check and Trigger AWS CodeBuild') {
            steps {
                script {
                    echo "Project: ${PROJECT_NAME} | Environment: ${ENVIRONMENT} | CodeBuild: ${CODEBUILD_PROJECT_NAME}"

                    def codeBuildStatus = sh(
                        script: """
                            aws codebuild batch-get-projects --names "${CODEBUILD_PROJECT_NAME}" --region "${AWS_REGION}" --query 'projects[0].name' --output text
                        """,
                        returnStdout: true
                    ).trim()

                    if (!codeBuildStatus || codeBuildStatus == 'None' || codeBuildStatus == 'null') {
                        error "❌ AWS CodeBuild project not found: ${CODEBUILD_PROJECT_NAME}"
                    }
                    echo "✅ CodeBuild project exists: ${codeBuildStatus}"

                    def backendExists = sh(
                        script: """aws ecr describe-images --repository-name ${BACKEND_ECR_REPOSITORY} --image-ids imageTag=${BACKEND_TAG} --region ${AWS_REGION} >/dev/null 2>&1""",
                        returnStatus: true
                    ) == 0

                    def frontendExists = sh(
                        script: """aws ecr describe-images --repository-name ${FRONTEND_ECR_REPOSITORY} --image-ids imageTag=${FRONTEND_TAG} --region ${AWS_REGION} >/dev/null 2>&1""",
                        returnStatus: true
                    ) == 0

                    env.ECR_REGISTRY = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
                    env.FRONTEND_IMAGE = "${env.ECR_REGISTRY}/${FRONTEND_ECR_REPOSITORY}:${env.FRONTEND_TAG}"
                    env.BACKEND_IMAGE  = "${env.ECR_REGISTRY}/${BACKEND_ECR_REPOSITORY}:${env.BACKEND_TAG}"

                    if (backendExists && frontendExists) {
                        env.CODEBUILD_BUILD_ID = 'SKIPPED'
                        echo "✅ Both images already exist. Skipping CodeBuild."
                    } else {
                        def buildId = sh(
                            script: """
                                aws codebuild start-build \
                                    --project-name "${CODEBUILD_PROJECT_NAME}" \
                                    --source-version "${TAG_NAME}" \
                                    --region "${AWS_REGION}" \
                                    --environment-variables-override \
                                        name=ENVIRONMENT,value=${ENVIRONMENT},type=PLAINTEXT \
                                        name=PROJECT_NAME,value=${PROJECT_NAME},type=PLAINTEXT \
                                        name=GIT_TAG,value=${TAG_NAME},type=PLAINTEXT \
                                        name=BACKEND_TAG,value=${BACKEND_TAG},type=PLAINTEXT \
                                        name=FRONTEND_TAG,value=${FRONTEND_TAG},type=PLAINTEXT \
                                        name=BACKEND_SECRET_KEY,value=${BACKEND_SECRET_KEY},type=PLAINTEXT \
                                        name=FRONTEND_SECRET_KEY,value=${FRONTEND_SECRET_KEY},type=PLAINTEXT \
                                        name=S3_ENV_BUCKET,value=${S3_ENV_BUCKET},type=PLAINTEXT \
                                    --query 'build.id' --output text
                            """,
                            returnStdout: true
                        ).trim()

                        if (!buildId || buildId == 'None' || buildId == 'null') {
                            error "❌ Failed to start AWS CodeBuild."
                        }
                        env.CODEBUILD_BUILD_ID = buildId
                        echo "✅ CodeBuild started. Build ID: ${env.CODEBUILD_BUILD_ID}"
                    }
                }
            }
        }

        stage('Wait for AWS CodeBuild Completion') {
            when { expression { env.CODEBUILD_BUILD_ID && env.CODEBUILD_BUILD_ID != 'SKIPPED' } }
            steps {
                script {
                    timeout(time: 30, unit: 'MINUTES') {
                        def buildStatus = ''
                        while (true) {
                            buildStatus = sh(
                                script: """aws codebuild batch-get-builds --ids ${CODEBUILD_BUILD_ID} --region ${AWS_REGION} --query 'builds[0].buildStatus' --output text""",
                                returnStdout: true
                            ).trim()
                            echo "Build status: ${buildStatus}"
                            if (['SUCCEEDED','FAILED','STOPPED','FAULT','TIMED_OUT'].contains(buildStatus)) break
                            sleep 10
                        }
                        if (buildStatus != 'SUCCEEDED') {
                            error "❌ AWS CodeBuild failed with status: ${buildStatus}"
                        }
                        echo "✅ AWS CodeBuild completed successfully."
                    }
                }
            }
        }

        stage('Verify ECR Images') {
            steps {
                script {
                    sh """aws ecr describe-images --repository-name ${FRONTEND_ECR_REPOSITORY} --image-ids imageTag=${FRONTEND_TAG} --region ${AWS_REGION} --query 'imageDetails[0].imageTags' --output text"""
                    sh """aws ecr describe-images --repository-name ${BACKEND_ECR_REPOSITORY} --image-ids imageTag=${BACKEND_TAG} --region ${AWS_REGION} --query 'imageDetails[0].imageTags' --output text"""
                    echo "✅ Both images verified. Frontend: ${FRONTEND_IMAGE} | Backend: ${BACKEND_IMAGE}"
                }
            }
        }

        stage('Generate Frontend Task Definition') {
            steps {
                script {
                    env.FRONTEND_TASK_FAMILY = "itsoftlab-360-${PROJECT_NAME}-frontend"
                    env.FRONTEND_CONTAINER_NAME = "${PROJECT_NAME}-frontend"
                    env.FRONTEND_CONTAINER_PORT = "80"
                    env.FRONTEND_EXECUTION_ROLE = "arn:aws:iam::${AWS_ACCOUNT_ID}:role/ecsTaskExecutionRole"
                    env.FRONTEND_TASK_ROLE = "arn:aws:iam::${AWS_ACCOUNT_ID}:role/ecsTaskRole"
                    env.FRONTEND_LOG_GROUP =  "/ecs/${FRONTEND_TASK_FAMILY}"
                    env.FRONTEND_ENV_FILE_ARN = "arn:aws:s3:::its360-secure-env-file/${FRONTEND_SECRET_KEY}"

                    sh """
cat > frontend-task-definition.json <<EOF
{
    "family": "${FRONTEND_TASK_FAMILY}",
    "executionRoleArn": "${FRONTEND_EXECUTION_ROLE}",
    "taskRoleArn": "${FRONTEND_TASK_ROLE}",
    "networkMode": "awsvpc",
    "requiresCompatibilities": ["FARGATE"],
    "cpu": "512",
    "memory": "1024",
    "runtimePlatform": { "cpuArchitecture": "X86_64", "operatingSystemFamily": "LINUX" },
    "containerDefinitions": [
        {
            "name": "${FRONTEND_CONTAINER_NAME}",
            "image": "${FRONTEND_IMAGE}",
            "cpu": 0,
            "portMappings": [
                { "containerPort": ${FRONTEND_CONTAINER_PORT}, "hostPort": 80, "protocol": "tcp", "name": "${FRONTEND_CONTAINER_NAME}-80-tcp", "appProtocol": "http" }
            ],
            "essential": true,
            "environment": [],
            "environmentFiles": [ { "value": "${FRONTEND_ENV_FILE_ARN}", "type": "s3" } ],
            "mountPoints": [], "volumesFrom": [], "ulimits": [],
            "logConfiguration": {
                "logDriver": "awslogs",
                "options": { "awslogs-group": "${FRONTEND_LOG_GROUP}", "awslogs-create-group": "true", "awslogs-region": "${AWS_REGION}", "awslogs-stream-prefix": "ecs" }
            },
            "healthCheck": {
                "command": ["CMD-SHELL", "curl -f http://localhost:80/ || exit 1"],
                "interval": 30, "timeout": 5, "retries": 3, "startPeriod": 10
            }
        }
    ]
}
EOF
"""
                    sh "jq empty frontend-task-definition.json"
                    echo "✅ Frontend task definition JSON is valid."
                }
            }
        }

        stage('Generate Backend Task Definition') {
            steps {
                script {
                    env.BACKEND_TASK_FAMILY = "itsoftlab-360-${PROJECT_NAME}-backend"
                    env.BACKEND_CONTAINER_NAME = "${PROJECT_NAME}-backend"
                    env.BACKEND_CONTAINER_PORT = "5000"
                    env.BACKEND_EXECUTION_ROLE = "arn:aws:iam::${AWS_ACCOUNT_ID}:role/ecsTaskExecutionRole"
                    env.BACKEND_TASK_ROLE = "arn:aws:iam::${AWS_ACCOUNT_ID}:role/ecsTaskRole"
                    env.BACKEND_LOG_GROUP = "/ecs/${BACKEND_TASK_FAMILY}"
                    env.BACKEND_ENV_FILE_ARN =  "arn:aws:s3:::its360-secure-env-file/${BACKEND_SECRET_KEY}"

                    sh """
cat > backend-task-definition.json <<EOF
{
    "family": "${BACKEND_TASK_FAMILY}",
    "executionRoleArn": "${BACKEND_EXECUTION_ROLE}",
    "taskRoleArn": "${BACKEND_TASK_ROLE}",
    "networkMode": "awsvpc",
    "requiresCompatibilities": ["FARGATE"],
    "cpu": "1024",
    "memory": "3072",
    "runtimePlatform": { "cpuArchitecture": "X86_64", "operatingSystemFamily": "LINUX" },
    "containerDefinitions": [
        {
            "name": "${BACKEND_CONTAINER_NAME}",
            "image": "${BACKEND_IMAGE}",
            "cpu": 0,
            "portMappings": [
                { "containerPort": ${BACKEND_CONTAINER_PORT}, "hostPort": 5000, "protocol": "tcp", "name": "${BACKEND_CONTAINER_NAME}-5000-tcp", "appProtocol": "http" }
            ],
            "essential": true,
            "environment": [],
            "environmentFiles": [ { "value": "${BACKEND_ENV_FILE_ARN}", "type": "s3" } ],
            "mountPoints": [], "volumesFrom": [], "ulimits": [],
            "logConfiguration": {
                "logDriver": "awslogs",
                "options": { "awslogs-group": "${BACKEND_LOG_GROUP}", "awslogs-create-group": "true", "awslogs-region": "${AWS_REGION}", "awslogs-stream-prefix": "ecs" }
            },
            "healthCheck": {
                "command": ["CMD-SHELL", "curl --fail --silent http://127.0.0.1:5000/health > /dev/null || exit 1"],
                "interval": 30, "timeout": 5, "retries": 3, "startPeriod": 60
            }
        }
    ]
}
EOF
"""
                    sh "jq empty backend-task-definition.json"
                    echo "✅ Backend task definition JSON is valid."
                }
            }
        }

        stage('Register Task Definitions') {
            steps {
                script {
                    def frontendTaskDefinitionArn = sh(
                        script: """aws ecs register-task-definition --cli-input-json file://frontend-task-definition.json --region ${AWS_REGION} --query 'taskDefinition.taskDefinitionArn' --output text""",
                        returnStdout: true
                    ).trim()
                    if (!frontendTaskDefinitionArn) { error "❌ Failed to register frontend task definition." }
                    env.FRONTEND_TASK_DEFINITION_ARN = frontendTaskDefinitionArn
                    echo "✅ Frontend task definition: ${env.FRONTEND_TASK_DEFINITION_ARN}"

                    def backendTaskDefinitionArn = sh(
                        script: """aws ecs register-task-definition --cli-input-json file://backend-task-definition.json --region ${AWS_REGION} --query 'taskDefinition.taskDefinitionArn' --output text""",
                        returnStdout: true
                    ).trim()
                    if (!backendTaskDefinitionArn) { error "❌ Failed to register backend task definition." }
                    env.BACKEND_TASK_DEFINITION_ARN = backendTaskDefinitionArn
                    echo "✅ Backend task definition: ${env.BACKEND_TASK_DEFINITION_ARN}"
                }
            }
        }

        stage('Create/Update ECS Services') {
            steps {
                script {
                    env.ECS_CLUSTER = "its360-cluster"
                    env.FRONTEND_SERVICE = "${PROJECT_NAME}-frontend-service"
                    env.BACKEND_SERVICE = "${PROJECT_NAME}-backend-service"
                    env.FRONTEND_LOAD_BALANCER = "${PROJECT_NAME}-frontend-lb"
                    env.BACKEND_LOAD_BALANCER = "${PROJECT_NAME}-backend-lb"
                    env.FRONTEND_TARGET_GROUP = "${PROJECT_NAME}-frontend-tg"
                    env.BACKEND_TARGET_GROUP = "${PROJECT_NAME}-backend-tg"
                    env.FRONTEND_CONTAINER_NAME = "${PROJECT_NAME}-frontend"
                    env.BACKEND_CONTAINER_NAME = "${PROJECT_NAME}-backend"
                    env.FRONTEND_CONTAINER_PORT = "80"
                    env.BACKEND_CONTAINER_PORT = "5000"

                    env.VPC_ID = "vpc-08bb09e9a7c10b095"
                    env.SUBNET_1 = "subnet-06fe5b3d8e95ad780"
                    env.SUBNET_2 = "subnet-0cf9fd6f508540589"
                    env.SECURITY_GROUP_1 = "sg-05e021221abdb240e"
                    env.SECURITY_GROUP_2 = "sg-02f964fc431f9b80f"

                    env.FRONTEND_HEALTH_PATH = "/"
                    env.BACKEND_HEALTH_PATH = "/health"

                    def clusterStatus = sh(
                        script: """aws ecs describe-clusters --clusters ${ECS_CLUSTER} --region ${AWS_REGION} --query 'clusters[0].status' --output text""",
                        returnStdout: true
                    ).trim()
                    if (clusterStatus != "ACTIVE") { error "❌ ECS cluster '${ECS_CLUSTER}' is not ACTIVE. Status: ${clusterStatus}" }
                    echo "✅ ECS cluster is ACTIVE."

                    def frontendLoadBalancerArn = sh(script: """aws elbv2 describe-load-balancers --names ${FRONTEND_LOAD_BALANCER} --region ${AWS_REGION} --query 'LoadBalancers[0].LoadBalancerArn' --output text 2>/dev/null || true""", returnStdout: true).trim()
                    if (!frontendLoadBalancerArn || frontendLoadBalancerArn == "None") {
                        frontendLoadBalancerArn = sh(script: """aws elbv2 create-load-balancer --name ${FRONTEND_LOAD_BALANCER} --type application --scheme internet-facing --subnets ${SUBNET_1} ${SUBNET_2} --security-groups ${SECURITY_GROUP_1} ${SECURITY_GROUP_2} --region ${AWS_REGION} --query 'LoadBalancers[0].LoadBalancerArn' --output text""", returnStdout: true).trim()
                        echo "✅ Frontend ALB created."
                    } else { echo "✅ Frontend ALB already exists." }
                    env.FRONTEND_LOAD_BALANCER_ARN = frontendLoadBalancerArn

                    def backendLoadBalancerArn = sh(script: """aws elbv2 describe-load-balancers --names ${BACKEND_LOAD_BALANCER} --region ${AWS_REGION} --query 'LoadBalancers[0].LoadBalancerArn' --output text 2>/dev/null || true""", returnStdout: true).trim()
                    if (!backendLoadBalancerArn || backendLoadBalancerArn == "None") {
                        backendLoadBalancerArn = sh(script: """aws elbv2 create-load-balancer --name ${BACKEND_LOAD_BALANCER} --type application --scheme internet-facing --subnets ${SUBNET_1} ${SUBNET_2} --security-groups ${SECURITY_GROUP_1} ${SECURITY_GROUP_2} --region ${AWS_REGION} --query 'LoadBalancers[0].LoadBalancerArn' --output text""", returnStdout: true).trim()
                        echo "✅ Backend ALB created."
                    } else { echo "✅ Backend ALB already exists." }
                    env.BACKEND_LOAD_BALANCER_ARN = backendLoadBalancerArn

                    def frontendTargetGroupArn = sh(script: """aws elbv2 describe-target-groups --names ${FRONTEND_TARGET_GROUP} --region ${AWS_REGION} --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null || true""", returnStdout: true).trim()
                    if (!frontendTargetGroupArn || frontendTargetGroupArn == "None") {
                        frontendTargetGroupArn = sh(script: """aws elbv2 create-target-group --name ${FRONTEND_TARGET_GROUP} --protocol HTTP --port 80 --target-type ip --vpc-id ${VPC_ID} --health-check-protocol HTTP --health-check-path ${FRONTEND_HEALTH_PATH} --health-check-port traffic-port --health-check-interval-seconds 30 --health-check-timeout-seconds 5 --healthy-threshold-count 2 --unhealthy-threshold-count 3 --region ${AWS_REGION} --query 'TargetGroups[0].TargetGroupArn' --output text""", returnStdout: true).trim()
                        echo "✅ Frontend target group created."
                    } else { echo "✅ Frontend target group already exists." }
                    env.FRONTEND_TARGET_GROUP_ARN = frontendTargetGroupArn

                    def backendTargetGroupArn = sh(script: """aws elbv2 describe-target-groups --names ${BACKEND_TARGET_GROUP} --region ${AWS_REGION} --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null || true""", returnStdout: true).trim()
                    if (!backendTargetGroupArn || backendTargetGroupArn == "None") {
                        backendTargetGroupArn = sh(script: """aws elbv2 create-target-group --name ${BACKEND_TARGET_GROUP} --protocol HTTP --port 5000 --target-type ip --vpc-id ${VPC_ID} --health-check-protocol HTTP --health-check-path ${BACKEND_HEALTH_PATH} --health-check-port traffic-port --health-check-interval-seconds 30 --health-check-timeout-seconds 5 --healthy-threshold-count 2 --unhealthy-threshold-count 3 --region ${AWS_REGION} --query 'TargetGroups[0].TargetGroupArn' --output text""", returnStdout: true).trim()
                        echo "✅ Backend target group created."
                    } else { echo "✅ Backend target group already exists." }
                    env.BACKEND_TARGET_GROUP_ARN = backendTargetGroupArn

                    def frontendListenerArn = sh(script: """aws elbv2 describe-listeners --load-balancer-arn ${FRONTEND_LOAD_BALANCER_ARN} --region ${AWS_REGION} --query 'Listeners[?Port==\\`80\\`].ListenerArn | [0]' --output text 2>/dev/null || true""", returnStdout: true).trim()
                    if (!frontendListenerArn || frontendListenerArn == "None") {
                        frontendListenerArn = sh(script: """aws elbv2 create-listener --load-balancer-arn ${FRONTEND_LOAD_BALANCER_ARN} --protocol HTTP --port 80 --default-actions Type=forward,TargetGroupArn=${FRONTEND_TARGET_GROUP_ARN} --region ${AWS_REGION} --query 'Listeners[0].ListenerArn' --output text""", returnStdout: true).trim()
                        echo "✅ Frontend listener created."
                    } else {
                        sh """aws elbv2 modify-listener --listener-arn ${frontendListenerArn} --default-actions Type=forward,TargetGroupArn=${FRONTEND_TARGET_GROUP_ARN} --region ${AWS_REGION}"""
                        echo "✅ Frontend listener verified."
                    }
                    env.FRONTEND_LISTENER_ARN = frontendListenerArn

                    def backendListenerArn = sh(script: """aws elbv2 describe-listeners --load-balancer-arn ${BACKEND_LOAD_BALANCER_ARN} --region ${AWS_REGION} --query 'Listeners[?Port==\\`80\\`].ListenerArn | [0]' --output text 2>/dev/null || true""", returnStdout: true).trim()
                    if (!backendListenerArn || backendListenerArn == "None") {
                        backendListenerArn = sh(script: """aws elbv2 create-listener --load-balancer-arn ${BACKEND_LOAD_BALANCER_ARN} --protocol HTTP --port 80 --default-actions Type=forward,TargetGroupArn=${BACKEND_TARGET_GROUP_ARN} --region ${AWS_REGION} --query 'Listeners[0].ListenerArn' --output text""", returnStdout: true).trim()
                        echo "✅ Backend listener created."
                    } else {
                        sh """aws elbv2 modify-listener --listener-arn ${backendListenerArn} --default-actions Type=forward,TargetGroupArn=${BACKEND_TARGET_GROUP_ARN} --region ${AWS_REGION}"""
                        echo "✅ Backend listener verified."
                    }
                    env.BACKEND_LISTENER_ARN = backendListenerArn

                    def frontendServiceArn = sh(script: """aws ecs describe-services --cluster ${ECS_CLUSTER} --services ${FRONTEND_SERVICE} --region ${AWS_REGION} --query 'services[0].serviceArn' --output text 2>/dev/null || true""", returnStdout: true).trim()
                    if (!frontendServiceArn || frontendServiceArn == "None") {
                        sh """
                            aws ecs create-service \
                                --cluster ${ECS_CLUSTER} --service-name ${FRONTEND_SERVICE} \
                                --task-definition ${FRONTEND_TASK_DEFINITION_ARN} --desired-count 1 \
                                --launch-type FARGATE --platform-version 1.4.0 --enable-execute-command \
                                --network-configuration "awsvpcConfiguration={subnets=[${SUBNET_1},${SUBNET_2}],securityGroups=[${SECURITY_GROUP_1},${SECURITY_GROUP_2}],assignPublicIp=ENABLED}" \
                                --load-balancers "targetGroupArn=${FRONTEND_TARGET_GROUP_ARN},containerName=${FRONTEND_CONTAINER_NAME},containerPort=80" \
                                --region ${AWS_REGION}
                        """
                        echo "✅ Frontend ECS service created."
                    } else {
                        sh """
                            aws ecs update-service --cluster ${ECS_CLUSTER} --service ${FRONTEND_SERVICE} \
                                --task-definition ${FRONTEND_TASK_DEFINITION_ARN} \
                                --load-balancers "targetGroupArn=${FRONTEND_TARGET_GROUP_ARN},containerName=${FRONTEND_CONTAINER_NAME},containerPort=80" \
                                --region ${AWS_REGION}
                        """
                        echo "✅ Frontend ECS service updated."
                    }

                    def backendServiceArn = sh(script: """aws ecs describe-services --cluster ${ECS_CLUSTER} --services ${BACKEND_SERVICE} --region ${AWS_REGION} --query 'services[0].serviceArn' --output text 2>/dev/null || true""", returnStdout: true).trim()
                    if (!backendServiceArn || backendServiceArn == "None") {
                        sh """
                            aws ecs create-service \
                                --cluster ${ECS_CLUSTER} --service-name ${BACKEND_SERVICE} \
                                --task-definition ${BACKEND_TASK_DEFINITION_ARN} --desired-count 1 \
                                --launch-type FARGATE --platform-version 1.4.0 --enable-execute-command \
                                --network-configuration "awsvpcConfiguration={subnets=[${SUBNET_1},${SUBNET_2}],securityGroups=[${SECURITY_GROUP_1},${SECURITY_GROUP_2}],assignPublicIp=ENABLED}" \
                                --load-balancers "targetGroupArn=${BACKEND_TARGET_GROUP_ARN},containerName=${BACKEND_CONTAINER_NAME},containerPort=5000" \
                                --region ${AWS_REGION}
                        """
                        echo "✅ Backend ECS service created."
                    } else {
                        sh """
                            aws ecs update-service --cluster ${ECS_CLUSTER} --service ${BACKEND_SERVICE} \
                                --task-definition ${BACKEND_TASK_DEFINITION_ARN} \
                                --load-balancers "targetGroupArn=${BACKEND_TARGET_GROUP_ARN},containerName=${BACKEND_CONTAINER_NAME},containerPort=5000" \
                                --region ${AWS_REGION}
                        """
                        echo "✅ Backend ECS service updated."
                    }
                }
            }
        }

        stage('Wait for ECS Stability') {
            steps {
                script {
                    sh """aws ecs wait services-stable --cluster ${ECS_CLUSTER} --services ${FRONTEND_SERVICE} --region ${AWS_REGION}"""
                    echo "✅ Frontend ECS service is stable."
                    sh """aws ecs wait services-stable --cluster ${ECS_CLUSTER} --services ${BACKEND_SERVICE} --region ${AWS_REGION}"""
                    echo "✅ Backend ECS service is stable."
                }
            }
        }

        stage('Health Check') {
            steps {
                script {
                    def frontendTaskHealth = sh(script: """aws ecs list-tasks --cluster ${ECS_CLUSTER} --service-name ${FRONTEND_SERVICE} --desired-status RUNNING --region ${AWS_REGION} --query 'taskArns' --output text""", returnStdout: true).trim()
                    if (!frontendTaskHealth || frontendTaskHealth == "None") { error "❌ No RUNNING frontend ECS task found." }

                    def backendTaskHealth = sh(script: """aws ecs list-tasks --cluster ${ECS_CLUSTER} --service-name ${BACKEND_SERVICE} --desired-status RUNNING --region ${AWS_REGION} --query 'taskArns' --output text""", returnStdout: true).trim()
                    if (!backendTaskHealth || backendTaskHealth == "None") { error "❌ No RUNNING backend ECS task found." }

                    def frontendUnhealthy = sh(script: """aws elbv2 describe-target-health --target-group-arn ${FRONTEND_TARGET_GROUP_ARN} --region ${AWS_REGION} --query 'TargetHealthDescriptions[?TargetHealth.State!=`healthy`].TargetHealth.State' --output text""", returnStdout: true).trim()
                    if (frontendUnhealthy) { error "❌ Frontend ALB target health check failed: ${frontendUnhealthy}" }

                    def backendUnhealthy = sh(script: """aws elbv2 describe-target-health --target-group-arn ${BACKEND_TARGET_GROUP_ARN} --region ${AWS_REGION} --query 'TargetHealthDescriptions[?TargetHealth.State!=`healthy`].TargetHealth.State' --output text""", returnStdout: true).trim()
                    if (backendUnhealthy) { error "❌ Backend ALB target health check failed: ${backendUnhealthy}" }

                    echo "✅ Frontend ECS/ALB: HEALTHY | Backend ECS/ALB: HEALTHY"
                    echo "🚀 VMS deployment is healthy."
                }
            }
        }
    }
}