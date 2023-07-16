import { SecretValue } from "aws-cdk-lib";
import { Peer, Port, SecurityGroup, Vpc } from "aws-cdk-lib/aws-ec2";
import { Cluster, ContainerImage, Secret as ecsSecret } from "aws-cdk-lib/aws-ecs";
import { ApplicationLoadBalancedFargateService } from "aws-cdk-lib/aws-ecs-patterns";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import { Parameters } from "../../../../parameters";

export interface StfCoreOrionFargateProps {
  vpc: Vpc;
  sg_database: SecurityGroup;
  db_endpoint: string;
  secret_arn: string;
  image_context_broker: string;
}

export class StfCoreOrionFargate extends Construct {
  public readonly fargate_alb: ApplicationLoadBalancedFargateService;

  constructor(scope: Construct, id: string, props: StfCoreOrionFargateProps) {
    super(scope, id);
            // Check props
            if (!props.vpc){
              throw new Error('The property vpc is required to create an instance of StfCoreOrionFargate Construct')
          }

          if (!props.sg_database){
              throw new Error('The property sg_database is required to create an instance of StfCoreOrionFargate Construct')
          }
          if (!props.db_endpoint){
              throw new Error('The property db_endpoint is required to create an instance of StfCoreOrionFargate Construct')
          }
          if (!props.secret_arn){
              throw new Error('The property secret_arn is required to create an instance of StfCoreOrionFargate Construct')
          }
          if (!props.image_context_broker){
              throw new Error('The property image_context_broker is required to create an instance of ScorpioServerlessFargate Construct')
          }

    const secret = Secret.fromSecretCompleteArn(this, 'Secret', props.secret_arn)

    const sg_orion = new SecurityGroup(this, "SecurityGroupOrion", {
      vpc: props.vpc,
    })
    props.sg_database.addIngressRule(sg_orion, Port.tcp(27017))
    sg_orion.addIngressRule(Peer.anyIpv4() ,Port.tcp(1026))

    const pwd = ecsSecret.fromSecretsManager(secret, 'password')
    const usn = ecsSecret.fromSecretsManager(secret, 'username')

    const fargate_cluster = new Cluster(
      this,
      "EcsClusterStfOrionLdDocumentDb",
      { vpc: props.vpc }
    )
    const fargate_alb = new ApplicationLoadBalancedFargateService( this, "FargateServiceStfOrionLdDocumentDb", {
        cluster: fargate_cluster,
        cpu: 512,
        desiredCount: Parameters.stf_orion.fargate_desired_count,
        taskImageOptions: {
          image: ContainerImage.fromRegistry(props.image_context_broker),
          secrets: {
            ORIONLD_MONGO_PASSWORD: ecsSecret.fromSecretsManager(secret, 'password'),
            ORIONLD_MONGO_USER: ecsSecret.fromSecretsManager(secret, 'username')
            },
          environment: {
            ORIONLD_MONGOCONLY: "TRUE",
            ORIONLD_MONGO_URI: `mongodb://${secret.secretValueFromJson('username').toString()}:${secret.secretValueFromJson('password').toString()}@${props.db_endpoint}/?replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false`,
            ORIONLD_SUBCACHE_IVAL: '3'
          },
          containerPort: 1026,
        },
        memoryLimitMiB: 2048, // Default is 512
        publicLoadBalancer: true,
        securityGroups: [sg_orion]
      }
    )
    this.fargate_alb = fargate_alb
    fargate_alb.targetGroup.configureHealthCheck({
      path: "/ngsi-ld/ex/v1/version",
      port: "1026",
    })


  }
}
