import { CfnOutput, SecretValue, Token } from "aws-cdk-lib"
import { VpcLink } from "aws-cdk-lib/aws-apigateway"
import { Port, SecurityGroup, Vpc } from "aws-cdk-lib/aws-ec2"
import { Repository } from "aws-cdk-lib/aws-ecr"
import { Cluster, ContainerImage, LogDrivers, Secret as ecsSecret } from "aws-cdk-lib/aws-ecs"
import { ApplicationLoadBalancedFargateService } from "aws-cdk-lib/aws-ecs-patterns"
import { RetentionDays } from "aws-cdk-lib/aws-logs"
import { CfnCluster } from "aws-cdk-lib/aws-msk"
import { ServerlessCluster } from "aws-cdk-lib/aws-rds"
import { Secret } from "aws-cdk-lib/aws-secretsmanager"
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from "aws-cdk-lib/custom-resources"

import { Construct } from "constructs"

export interface ScorpioServerlessFargateProps {
    vpc: Vpc
    sg_kafka: SecurityGroup,
    sg_aurora: SecurityGroup,
    aurora_cluster_endpoint: string,
    aurora_cluster_port: string,
    secret_arn: string,
    kafka_brokers: string, 
    image_context_broker: string
}

export class ScorpioServerlessFargate extends Construct {
    public readonly fargate_alb : ApplicationLoadBalancedFargateService

    constructor(scope: Construct, id: string, props: ScorpioServerlessFargateProps) {
        super(scope, id)

        // Check props
        if (!props.vpc){
            throw new Error('The property vpc is required to create an instance of ScorpioServerlessFargate Construct')
        }
        if (!props.sg_kafka){
            throw new Error('The property sg_kafka is required to create an instance of ScorpioServerlessFargate Construct')
        }
        if (!props.sg_aurora){
            throw new Error('The property sg_aurora is required to create an instance of ScorpioServerlessFargate Construct')
        }
        if (!props.aurora_cluster_endpoint){
            throw new Error('The property aurora_cluster_endpoint is required to create an instance of ScorpioServerlessFargate Construct')
        }
        if (!props.aurora_cluster_port){
            throw new Error('The property aurora_cluster_port is required to create an instance of ScorpioServerlessFargate Construct')
        }
        if (!props.secret_arn){
            throw new Error('The property secret_arn is required to create an instance of ScorpioServerlessFargate Construct')
        }
        if (!props.kafka_brokers){
            throw new Error('The property kafka_brokers is required to create an instance of ScorpioServerlessFargate Construct')
        }
        if (!props.image_context_broker){
            throw new Error('The property image_context_broker is required to create an instance of ScorpioServerlessFargate Construct')
        }

        const secret = Secret.fromSecretCompleteArn(this, 'Secret', props.secret_arn)

        const sg_fargate = new SecurityGroup(this, 'SecurityGroupScorpio', {vpc: props.vpc})

        const sg_aurora = SecurityGroup.fromSecurityGroupId(this, 'sgAurora', props.sg_aurora.securityGroupId)
        const sg_kafka = SecurityGroup.fromSecurityGroupId(this, 'sgKafka', props.sg_kafka.securityGroupId)

        sg_kafka.addIngressRule(sg_fargate, Port.tcp(9092))
        sg_kafka.addIngressRule(sg_fargate, Port.tcp(9094))
        sg_aurora.addIngressRule(sg_fargate, Port.tcp(5432))
        const fargate_cluster = new Cluster(this, 'FargateScorpioCluster', {vpc: props.vpc})

        const db_pass = SecretValue.secretsManager(secret.secretArn).toJSON()
        
        const kafka_endpoint = props.kafka_brokers

        const kafka_port = props.kafka_brokers.split(',')[0].split(':')[1]
        const fargate_alb = new ApplicationLoadBalancedFargateService(this, 'FargateServiceScorpioServerless', {
            cluster: fargate_cluster,
            circuitBreaker: {
                rollback: true
            },
            cpu: 512, 
            desiredCount: 3, 
            publicLoadBalancer: false, 
            taskImageOptions: {
                image: ContainerImage.fromRegistry(props.image_context_broker),
                secrets: {
                    DBPASS: ecsSecret.fromSecretsManager(secret, 'password'),
                    DBUSER: ecsSecret.fromSecretsManager(secret, 'username')
                },
                environment: {
                    DBHOST: props.aurora_cluster_endpoint,
                    DBPORT: props.aurora_cluster_port,   
                    DBNAME: 'scorpio',
                    BOOTSTRAP_SERVERS: kafka_endpoint
                },
                containerPort: 9090,
                logDriver: LogDrivers.awsLogs({
                    streamPrefix: id, 
                    logRetention: RetentionDays.THREE_MONTHS
                })
            },
            memoryLimitMiB: 2048, // Default is 512
            securityGroups: [sg_fargate]
        })
        this.fargate_alb = fargate_alb
        fargate_alb.targetGroup.configureHealthCheck({
            path: '/actuator/health',
            port: '9090'
        })

        new CfnOutput(this, 'otpa', {
            value: kafka_endpoint
        })

        new CfnOutput(this, 'otpb', {
            value: (Token.asString(kafka_endpoint)).split(',')[0].split(':')[0]
        })

    }


}