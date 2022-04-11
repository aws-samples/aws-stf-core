exports.handler = async (event, context) => {
    // console.log(event)
    const output = event.records.map((record) => ({
        recordId: record.recordId,
        result: 'Ok',
        data: `${Buffer.from( JSON.stringify( JSON.parse( JSON.parse( Buffer.from(record.data, 'base64').toString('utf8')).Message)), 'utf8').toString('base64')}`
    }))
    console.log(`Processing completed.  Successful records ${output.length}.`)
    return { records: output }
}