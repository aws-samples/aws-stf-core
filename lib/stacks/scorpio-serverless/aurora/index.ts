import { CfnOutput, Token } from "aws-cdk-lib"
import { SecurityGroup, SubnetType, Vpc } from "aws-cdk-lib/aws-ec2"
import { Credentials, DatabaseClusterEngine, ParameterGroup, ServerlessCluster } from "aws-cdk-lib/aws-rds"
import { Secret } from "aws-cdk-lib/aws-secretsmanager"

import { Construct } from "constructs"

export interface ScorpioServerlessAuroraProps{
    vpc: Vpc
    secret_arn: string
}

export class ScorpioServerlessAurora extends Construct{

    public readonly aurora_cluster_endpoint: string
    public readonly aurora_cluster_port: string
    public readonly sg_aurora: SecurityGroup

    constructor(scope: Construct, id: string, props: ScorpioServerlessAuroraProps) {
        super(scope, id)

        // Check props
        if (!props.vpc){
            throw new Error('The property vpc is required to create an instance of ScorpioServerlessAurora Construct')
        }
        if (!props.secret_arn){
            throw new Error('The property secret_arn is required to create an instance of ScorpioServerlessAurora Construct')
        }
        
        const secret = Secret.fromSecretCompleteArn(this, 'Secret', props.secret_arn)
        const sg_aurora = new SecurityGroup(this, 'SecurityGroupAurora', {vpc: props.vpc})
        this.sg_aurora = sg_aurora

       const aurora_cluster = new ServerlessCluster(this, 'AuroraServerlessCluster', {
            credentials: Credentials.fromSecret(secret),
            engine: DatabaseClusterEngine.AURORA_POSTGRESQL,
            parameterGroup: ParameterGroup.fromParameterGroupName(this, 'ParameterGroup', 'default.aurora-postgresql10'),
            vpc: props.vpc, 
            defaultDatabaseName: 'scorpio',
            securityGroups: [sg_aurora],
            vpcSubnets:{
                subnetType: SubnetType.PRIVATE_ISOLATED
            }
        })
        this.aurora_cluster_endpoint = aurora_cluster.clusterEndpoint.hostname
        this.aurora_cluster_port = `${Token.asString(aurora_cluster.clusterEndpoint.port)}`

        const aurora_endpoint = new CfnOutput(this, 'aurora_endpoint', {
            value: aurora_cluster.clusterEndpoint.hostname
        })
        const aurora_port = new CfnOutput(this, 'aurora_port', {
            value: `${Token.asString(aurora_cluster.clusterEndpoint.port)}`
        })
    }
}