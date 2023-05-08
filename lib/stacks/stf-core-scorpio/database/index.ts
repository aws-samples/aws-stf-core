import { CfnOutput, Token } from "aws-cdk-lib"
import { Instance, InstanceClass, InstanceType, SecurityGroup, SubnetType, InstanceSize, Vpc } from "aws-cdk-lib/aws-ec2"
import { RetentionDays } from "aws-cdk-lib/aws-logs"
import { AuroraCapacityUnit, Credentials, DatabaseCluster, DatabaseClusterEngine, DatabaseInstance, DatabaseInstanceEngine, ParameterGroup, PostgresEngineVersion, ServerlessCluster, StorageType } from "aws-cdk-lib/aws-rds"
import { Secret } from "aws-cdk-lib/aws-secretsmanager"

import { Construct } from "constructs"
import { Parameters } from "../../../../parameters"

export interface StfCoreScorpioDatabaseProps {
    vpc: Vpc
    secret_arn: string
}

export class StfCoreScorpioDatabase extends Construct{

    public readonly database_endpoint: string
    public readonly database_port: string
    public readonly sg_database: SecurityGroup

    constructor(scope: Construct, id: string, props: StfCoreScorpioDatabaseProps) {
        super(scope, id)

        // Check props
        if (!props.vpc){
            throw new Error('The property vpc is required to create an instance of ScorpioDatabase Construct')
        }
        if (!props.secret_arn){
            throw new Error('The property secret_arn is required to create an instance of ScorpioDatabase Construct')
        }
        
        const secret = Secret.fromSecretCompleteArn(this, 'Secret', props.secret_arn)
        const sg_database = new SecurityGroup(this, 'SecurityGroupDatabase', {vpc: props.vpc})
        this.sg_database = sg_database

       if(Parameters.stf_scorpio.aurora_serverless){
        const aurora_cluster = new ServerlessCluster(this, 'AuroraServerlessCluster', {
            credentials: Credentials.fromSecret(secret),
            engine: DatabaseClusterEngine.AURORA_POSTGRESQL,
            parameterGroup: ParameterGroup.fromParameterGroupName(this, 'ParameterGroup', 'default.aurora-postgresql10'),
            vpc: props.vpc, 
            defaultDatabaseName: Parameters.stf_scorpio.dbname,
            securityGroups: [sg_database],
            vpcSubnets:{
                subnetType: SubnetType.PRIVATE_ISOLATED
            },
            scaling: Parameters.stf_scorpio.aurora_scaling
        })
        this.database_endpoint = aurora_cluster.clusterEndpoint.hostname
        this.database_port = `${Token.asString(aurora_cluster.clusterEndpoint.port)}`

        const aurora_endpoint = new CfnOutput(this, 'database_endpoint', {
            value: aurora_cluster.clusterEndpoint.hostname
        })
        const aurora_port = new CfnOutput(this, 'database_port', {
            value: `${Token.asString(aurora_cluster.clusterEndpoint.port)}`
        })
       } else {
        // We use RDS Instance 
        const database = new DatabaseInstance(this, 'DatabaseInstance', {
            credentials: Credentials.fromSecret(secret),
            engine: DatabaseInstanceEngine.postgres({version: PostgresEngineVersion.VER_14_4}),
            multiAz: true, 
            cloudwatchLogsRetention: RetentionDays.THREE_MONTHS, 
            instanceType: Parameters.stf_scorpio.rds_instance_type,
            storageType: Parameters.stf_scorpio.rds_storage_type,
            vpc: props.vpc, 
            securityGroups: [sg_database],
            databaseName: Parameters.stf_scorpio.dbname,
            vpcSubnets:{
                subnetType: SubnetType.PRIVATE_ISOLATED
            }
        })

        this.database_endpoint = database.dbInstanceEndpointAddress
        this.database_port = `${Token.asString(database.dbInstanceEndpointPort)}`

        const aurora_endpoint = new CfnOutput(this, 'database_endpoint', {
            value: database.dbInstanceEndpointAddress
        })
        const aurora_port = new CfnOutput(this, 'database_port', {
            value: `${Token.asString(database.dbInstanceEndpointPort)}`
        })
       } 


    }
}