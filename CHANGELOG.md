# Changelog

All notable changes to this project will be documented in this file.


## Version 1.0.0 

### STF single endpoint

The version 1.0.0 exposes a single endpoint for the FIWARE Context Broker API and the STF IoT API.

The API for the FIWARE Context Broker remains unchanged (`{StfCoreEndpoint}/ngsi-ld/v1/`) and fully compliant with NGSI-LD API as as defined [here](https://forge.etsi.org/swagger/ui/?url=https://forge.etsi.org/rep/NGSI-LD/NGSI-LD/raw/master/spec/updated/generated/full_api.json). 

The API for the STF IoT brings new capabilities. You can now query `GET {StfCoreEndpoint}/iot/things` to get this list of all the things registered including their named shadow `Stf-Device`.
With the single query `{StfCoreEndpoint}/iot/things/{thingName}`, you can also get all the entities associated to the thing.
Finally, with the STF IoT API you can also delete your things in the STF IoT Registry with the request `DELETE` `{StfCoreEndpoint}/iot/things/{thingName}`.

See [the README](./README.md#register-and-manage-your-things-using-the-stf-iot-api) for more details about this new capabilities. 

### Architectural changes of the STF IoT module 

In the new architecture, the SNS is removed. The IoT Rule triggers directly the SQS Queue to update and the Context Broker and Kinesis Firehose to feed the STF IoT Datalake. The construct IoT Datalake is now part of the STF IoT Core construct. 

<br>

![STF IoT Architecture](./docs/images/stfiot_arch.png)

<br>

### STF IoT Datalake

[Dynamic Partitioning](https://docs.aws.amazon.com/firehose/latest/dev/dynamic-partitioning.html) is now used in the STF IoT Datalake. Entities stored in the STF IoT Datalake are partitioned by `type` and time (`yyyy-MM-dd-HH`). See [the README](./README.md#register-and-manage-your-things-using-the-stf-iot-api) for more details about this new capabilities. 


