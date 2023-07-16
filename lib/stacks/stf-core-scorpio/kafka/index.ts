import { CfnOutput, Lazy, Names } from "aws-cdk-lib"
import { SecurityGroup, SubnetType, Vpc } from "aws-cdk-lib/aws-ec2"
import { CfnCluster, CfnConfiguration } from "aws-cdk-lib/aws-msk"
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId, PhysicalResourceIdReference } from "aws-cdk-lib/custom-resources"
import { Construct } from "constructs"
import { Parameters } from "../../../../parameters"

import { createHash } from "crypto"

const hash = (data:string) => {
    return createHash("shake256", {outputLength:8}).update(data).digest('hex')
}


export interface StfCoreScorpioKafkaProps {
    vpc: Vpc
}

export class StfCoreScorpioKafka  extends Construct {
    public readonly kafka_cluster_arn : string
    public readonly kafka_brokers: string
    public readonly sg_kafka : SecurityGroup
    constructor(scope: Construct, id: string, props: StfCoreScorpioKafkaProps) {
        super(scope, id)

        // Check props
        if (!props.vpc){
            throw new Error('The property vpc is required to create an instance of ScorpioServerlessKafka Construct')
        }

        

        const kafka_config_props = {
            serverProperties: `auto.create.topics.enable = true`,
            kafkaVersionsList: [Parameters.stf_scorpio.kafka_version]
        }
        

        const kafka_config_name = `${Names.uniqueId(this)}-config-${hash(JSON.stringify(kafka_config_props))}`


        const kafka_config = new CfnConfiguration(this, "KafkaConfig", {
            name: kafka_config_name,
            ...kafka_config_props
        })

        const kafka_config_revision = new AwsCustomResource( this, 'kafkaConfig', {
            onUpdate: {
              service: "Kafka",
              action: "describeConfiguration",
              parameters: {
                Arn: kafka_config.attrArn
              },
              physicalResourceId: PhysicalResourceId.fromResponse('Arn')
            },
            policy: AwsCustomResourcePolicy.fromSdkCalls({resources: AwsCustomResourcePolicy.ANY_RESOURCE})
        })


        const sg_kafka = new SecurityGroup(this, 'SecurityGroupKafka', {vpc: props.vpc})
        this.sg_kafka = sg_kafka

        const kafka_cluster = new CfnCluster(this, 'Cluster', {
            kafkaVersion: Parameters.stf_scorpio.kafka_version,

            numberOfBrokerNodes: Parameters.stf_scorpio.kafka_number_nodes, 
            clusterName: Parameters.stf_scorpio.kafka_cluster_name,
            configurationInfo: {
                arn: kafka_config.attrArn,
                revision: kafka_config_revision.getResponseField('LatestRevision.Revision') as any as number
            },
            encryptionInfo: {
                encryptionInTransit: {
                    clientBroker: 'TLS_PLAINTEXT'
                }
            },
            clientAuthentication: {
                sasl: {
                    iam: {
                        enabled: false
                    },
                    scram: {
                        enabled: false
                    }
                },
                tls: {
                    enabled: false
                },
                unauthenticated: {
                    enabled: true
                }
                
            },
            brokerNodeGroupInfo: {
                securityGroups: [sg_kafka.securityGroupId], 
                clientSubnets: [...props.vpc.selectSubnets({subnetType: SubnetType.PRIVATE_ISOLATED}).subnetIds],
                instanceType: Parameters.stf_scorpio.kafka_instance_type,
                storageInfo: {
                    ebsStorageInfo: {
                        volumeSize: Parameters.stf_scorpio.kafka_storage_size
                    }
                }
            }
          })

          kafka_cluster.node.addDependency(kafka_config)


        const kafka_out = new CfnOutput(this, 'output', {
            value: kafka_cluster.ref
        })

        this.kafka_cluster_arn = kafka_cluster.ref

        const kafka_endpoint = new AwsCustomResource(this, 'kafkaEndpoint', {
            onCreate: {
                service: 'Kafka',
                action: 'getBootstrapBrokers',
                physicalResourceId: PhysicalResourceId.fromResponse('BootstrapBrokerString'),
                parameters: {
                "ClusterArn": kafka_cluster.ref
                }
            },
            policy: AwsCustomResourcePolicy.fromSdkCalls({resources: AwsCustomResourcePolicy.ANY_RESOURCE})
        })
        this.kafka_brokers = kafka_endpoint.getResponseField('BootstrapBrokerString')  

    }
}