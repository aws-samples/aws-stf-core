 import { Aws } from "aws-cdk-lib"
import { InstanceClass, InstanceSize, InstanceType } from "aws-cdk-lib/aws-ec2"
import { AuroraCapacityUnit, StorageType } from "aws-cdk-lib/aws-rds"


enum Broker {
    Orion = "Orion", // Here orion refers to orion-ld broker:  https://github.com/FIWARE/context.Orion-LD
    Scorpio = "Scorpio"
}

export const Parameters = {
    aws_region: "eu-west-1", // see regions in which you can deploy the STF: https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vpc-links.html#http-api-vpc-link-availability
    stf_version: "1.2.0", // Do not change
    stf_broker: Broker.Scorpio, // choose between enum Broker value (Orion or Scorpio) 
    vpc_link_name: 'stf-vpc-link', 

    // Parameters for the the STF IoT module
    stf_iot: {
        new_bucket: true, // If true, the stack will create the bucket for the STF IoT DataLake. Set to false if you have already a bucket created. 
        bucket_name: `stf-iot-datalake-${Aws.REGION}-${Aws.ACCOUNT_ID}`, // Default name, change only if needed.
        shadow_prefix: "Stf",
        sqs_iot_queue_name: `StfIoTQueue-${Aws.REGION}`, // Default name, change only if needed.
        smart_data_model_url : 'https://raw.githubusercontent.com/smart-data-models/data-models/master/context.jsonld',
        timeout: '0', // Timeout for the API call in the Lambda that sync with context broker. Has to be a string to pass it in env variable 
        shadow_indexing: false // Activating Fleet Indexing for the shadows will occur costs, see https://aws.amazon.com/iot-device-management/pricing/ 
    },

    // Parameters for the Scorpio Broker
    stf_scorpio: {
        image_context_broker: 'public.ecr.aws/smart-territory-framework/scorpio:4.0.9', // Link to ECR Public gallery of Scorpio Broker image.
        rds_instance_type: InstanceType.of( InstanceClass.BURSTABLE4_GRAVITON, InstanceSize.SMALL), // see https://aws.amazon.com/rds/instance-types/
        rds_storage_type: StorageType.GP3, // see https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Storage.html
        dbname: 'scorpio',
        aurora_serverless: false, // If false, this creates a RDS PostgreSQL Database instance. If true, this creates an Aurora Cluster.  
        aurora_scaling: {
            maxCapacity: AuroraCapacityUnit.ACU_4,
            minCapacity: AuroraCapacityUnit.ACU_2      
        },
        kafka_config_name: `stf-kafka-config`,
        kafka_number_nodes: 2,
        kafka_version: "3.3.1", // see https://docs.aws.amazon.com/msk/latest/developerguide/supported-kafka-versions.html  
        kafka_instance_type: "kafka.t3.small", // see https://docs.aws.amazon.com/msk/latest/developerguide/bestpractices.html
        kafka_cluster_name: 'ScorpioCluster', 
        kafka_storage_size: 100, //  see https://docs.aws.amazon.com/msk/latest/developerguide/bestpractices.html
        fargate_desired_count: 2
    },
    // Parameters for the Orion-LD Broker
    stf_orion: {
        image_context_broker: 'public.ecr.aws/smart-territory-framework/orionld:latest',
        docdb_instance_type: InstanceType.of( InstanceClass.BURSTABLE4_GRAVITON, InstanceSize.MEDIUM), // https://docs.aws.amazon.com/documentdb/latest/developerguide/db-instance-classes.html 
        docdb_nb_instances: 2,
        fargate_desired_count: 2
    }

}