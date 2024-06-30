# Agent - Customer Server Interface

## Custom Server API Documentation

### Version 2.0.0

---

## Table of Contents

- [Introduction](#introduction)
- [Endpoints](#endpoints)
  - [/messagesToSign](#messagestosign)
  - [/messagesStatus](#messagesstatus)
- [Schemas](#schemas)
  - [MessageEnvelope](#messageenvelope)
  - [Message](#message)
  - [PayloadSignatureData](#payloadsignaturedata)
  - [MessagePayload](#messagepayload)
  - [MessageToSign](#messagetosign)
  - [TransportMetadata](#transportmetadata)
  - [MessageStatus](#messagestatus)
  - [MessageResponse](#messageresponse)
  - [SignedMessage](#signedmessage)
  - [RequestType](#requesttype)
  - [ResponseType](#responsetype)
  - [Algorithm](#algorithm)
  - [Error](#error)
- [Examples](#examples)
  - [MessagesRequest Examples](#messagesrequest-examples)
    - [KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST](#key_link_proof_of_ownership_request)
    - [KEY_LINK_TX_SIGN_REQUEST (BTC - UTXO Multiple Inputs)](#key_link_tx_sign_request-btc---utxo-multiple-inputs)
  - [MessagesStatusRequest Example](#messagesstatusrequest-example)
  - [MessagesStatusResponse Examples](#messagesstatusresponse-examples)
    - [KEY_LINK_PROOF_OF_OWNERSHIP_RESPONSE](#key_link_proof_of_ownership_response)
    - [KEY_LINK_TX_SIGN_RESPONSE (BTC - UTXO Multiple Inputs)](#key_link_tx_sign_response-btc---utxo-multiple-inputs)

---

## Introduction

This document provides a detailed overview of the Customer Server API, which facilitates communication between the Fireblocks Agent and the Customer Server in the Fireblocks Key Link enabled workspaces. The API allows for operations such as signing messages and retrieving the status of these messages.

---

## Endpoints

### /messagesToSign

**Description**: Sign Messages.<br>
**URL**: `/messagesToSign`<br>
**Request Method**: POST<br>
**Request Body**: `MessagesRequest`<br>


| Field                 | Type   | Required | Description                                  |
|-----------------------|--------|----------|----------------------------------------------|
| messages              | array  | Yes      | List of messages of type [MessageEnvelope](#messageenvelope)   |
<br/>

**Response**: `MessagesStatusResponse`<br>

| Field                 | Type   | Required | Description                                  |
|-----------------------|--------|----------|----------------------------------------------|
| statuses              | array  |          | List of message statuses of type [MessageStatus](#messagestatus) |
<br/>

### /messagesStatus

**Description**: Get updates on requested messages.<br>
**URL**: `/messagesStatus`<br>
**Request Method**: POST<br>
**Request Body**: `MessagesStatusRequest`<br>
| Field                 | Type   | Required | Description                                  |
|-----------------------|--------|----------|----------------------------------------------|
| requestIds            | array  | Yes      | List of request IDs                          |
<br/>

**Response**: `MessagesStatusResponse`<br>
| Field                 | Type   | Required | Description                                  |
|-----------------------|--------|----------|----------------------------------------------|
| statuses              | array  |          | List of message statuses of type [MessageStatus](#messagestatus) |
<br/>

## Schemas

### MessageEnvelope

| Field                 | Type   | Required | Description                                  |
|-----------------------|--------|----------|----------------------------------------------|
| message              | object  | Yes      | Object of type [Message](#message)   |
| transportMetadata              | object  |    Yes      | Object of type [TransportMetadata](#transportmetadata) |

### Message

| Field                | Type   | Required | Description                                  |
|----------------------|--------|----------|----------------------------------------------|
| payload              | string | Yes      | Stringified JSON that holds the message payload. Parsed object will be of type [`MessagePayload`](#messagepayload) |
| payloadSignatureData | object | Yes      | Object of type [`PayloadSignatureData`](#payloadsignaturedata) |

### PayloadSignatureData

| Field     | Type   | Required | Description                                  |
|-----------|--------|----------|----------------------------------------------|
| signature | string | Yes      | The signature on the payload signed by a Fireblocks core service |
| service   | string | Yes      | The Fireblocks core service which signed on the payload |

### MessagePayload

| Field                | Type   | Required | Description                                  |
|----------------------|--------|----------|----------------------------------------------|
| tenantId             | string | Yes      | The identifier of customer's Fireblocks workspace |
| type                 | string | Yes      | The type of request (referencing [`RequestType`](#requesttype) schema) |
| algorithm            | string | Yes      | The algorithm used for signing (referencing [`Algorithm`](#algorithm) schema) |
| signingDeviceKeyId   | string | Yes      | The identifier of the signing key on the customer's servers |
| keyId                | string | Yes      | The identifier of the signing key on Fireblocks |
| messagesToSign       | array  | Yes      | An array including the messages to be signed (referencing [`MessageToSign`](#messagetosign) schema) |
| requestId            | string | No       | The unique request ID used exclusively for Proof of Ownership requests |
| txId                 | string | No       | The unique transaction ID used exclusively for transaction signing requests |
| timestamp            | number | No       | The timestamp of the request |
| version              | string | No       | The version of the request |
| metadata             | object | No       | The metadata provides comprehensive information about the transaction and policies |

### MessageToSign
| Field                | Type   | Required | Description                                  |
|----------------------|--------|----------|----------------------------------------------|
| message              | string | Yes      | The message to be signed |
| index                | number | Yes      | The index of the message |

### TransportMetadata

| Field     | Type   | Required | Description                                  |
|-----------|--------|----------|----------------------------------------------|
| requestId | string | Yes      | The unique request ID used for tracking the request |
| type      | string | Yes      | Type of the request |

### MessageStatus

| Field           | Type   | Required | Description                                  |
|-----------------|--------|----------|----------------------------------------------|
| type            | string | Yes      | Type of the message status referencing type [`ResponseType`](#responsetype) |
| status          | string | Yes      | Status of the message with either of the enum values: PENDING_SIGN, SIGNED, FAILED |
| requestId         | string | Yes      | Original message request Id |
| response        | object | Yes      | Response for the message of type [`MessageResponse`](#messageresponse) |

### MessageResponse

| Field                | Type   | Required | Description                                  |
|----------------------|--------|----------|----------------------------------------------|
| signedMessages  | array  |  Yes if the status in [`MessageStatus`](#messagestatus) is SIGNED.        | List of signed messages as a [`SignedMessage`](#signedmessage) object. Required if the status in `MessageStatus` is SIGNED. |
| errorMessage    | string |  Yes if the status in [`MessageStatus`](#messagestatus) is FAILED.          | Error message if any. Required if the status in `MessageStatus` is FAILED. |

### SignedMessage

| Field     | Type   | Required | Description                                  |
|-----------|--------|----------|----------------------------------------------|
| message              | string | Yes      | The message to be signed |
| index                | number | Yes      | Index of the message |
| signature | string | Yes      | Signature of the message. 64-byte HEX encoded signature containing R and S values |

### RequestType

| Type   | Description                                                         |
|----------|---------------------------------------------------------------------|
| string | Possible values for the request: `KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST`, `KEY_LINK_TX_SIGN_REQUEST`. |

### ResponseType

| Type   | Description                                                         |
|----------|---------------------------------------------------------------------|
| string | Type of the response. Should be corresponding to the request. Possible values: `KEY_LINK_PROOF_OF_OWNERSHIP_RESPONSE`, `KEY_LINK_TX_SIGN_RESPONSE`.|

### Algorithm

| Type | Description                                                         |
|----------|---------------------------------------------------------------------|
| string| Cryptographic algorithm. Possible values for the algorithm: "ECDSA_SECP256K1", "EDDSA_ED25519" |

### Error

| Field     | Type   | Required | Description                                                         |
|-----------|--------|----------|---------------------------------------------------------------------|
| message   | string | Yes      | Error message |

---

## Examples

### MessagesRequest Examples

#### KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST

```json
{
  "messages": [
    {
      "message": {
        "payload": "{\"tenantId\":\"cc809d21-d88c-5763-845d-36219936ddf0\",\"requestId\":\"fdfd1256-a2b7-4d39-bdee-677fe9ca4516\",\"version\":\"2.0.0\",\"timestamp\":1719414147,\"type\":\"KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST\",\"algorithm\":\"EDDSA_ED25519\",\"keyId\":\"f459c517-59ac-4a57-a34b-233fb6976709\",\"signingDeviceKeyId\":\"7bea6d4ba1c5a23afaf65545cbeb5644be2aff9c14d72bdc1b8401a612fb1abe\",\"messagesToSign\":[{\"message\":\"786f1a5aa2524db792d9f61039bf029810033790f67978c9eeabcd277b7c46c5\",\"index\":0}]}",
        "payloadSignatureData": {
          "service": "CONFIGURATION_MANAGER",
          "signature": "a8b07ba68ad22a16cd0ae6c5bedea818eb60db452fbcfadd43caa42877a5243448ecdae1d62f7126a5ebb69d6f34b38f83b94c2ad489c775b1bccb9879354c0c9abd54e8b904715f78fef4c9d208a46ce2595f57bc9523de1a59999bef0a116e683a70b17211a2b4b69ce78653f94ee46057189a2e6f8b278231e2e1b17cf18161026ff7f5beb17ebb9797e914854b913a7b782a508a3f0539a38382432a480ef22127126b4f877e944e2264ff6791960867bf11dc00c875c0edc8586982359fe08b49321e392ec0b3acd894ea54463fcdb17d9cd3916218b4b0f3c8bfc920d6b593c68a914da9bf554935eeaa19a510e46c70a0bf3620b96930221262e7c83e"
        }
      },
      "transportMetadata": {
        "requestId": "fdfd1256-a2b7-4d39-bdee-677fe9ca4516",
        "type": "KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST"
      }
    }
  ]
}
```

#### KEY_LINK_TX_SIGN_REQUEST (BTC - UTXO Multiple Inputs)

```json
{
  "messages": [
      {
          "message": {
              "payload": "{\"tenantId\":\"cc809d21-d88c-5763-845d-36219936ddf0\",\"txId\":\"c9355902-28e6-4af3-b0a3-a67eace05cea\",\"keyId\":\"e4ba200b-dbd4-4d3e-b8ed-3828f2ba4981\",\"userAccessToken\":\"\",\"metadata\":{\"asset\":\"BTC_TEST\",\"amountStr\":\"0.00006202\",\"amount\":0.00006202,\"fee\":15990,\"coinbaseFee\":\"0.00015990\",\"destId\":\"1\",\"srcId\":3,\"srcType\":\"VAULT\",\"destType\":\"VAULT\",\"transactionType\":\"TRANSFER\",\"dstAddress\":\"tb1q42lz78hhrtehumacs963t7kftnlmygr6vsxzhd\",\"chaincode\":\"0000000000000000000000000000000000000000000000000000000000000000\",\"txMetaData\":\"{\\\"asset\\\":\\\"BTC_TEST\\\",\\\"amountUsdRate\\\":\\\"61656.80383584493\\\",\\\"amountNative\\\":0.00022192,\\\"srcType\\\":\\\"VAULT\\\",\\\"srcId\\\":\\\"3\\\",\\\"dstId\\\":\\\"1\\\",\\\"dstType\\\":\\\"VAULT\\\",\\\"transactionType\\\":\\\"TRANSFER\\\",\\\"feeLevel\\\":\\\"MEDIUM\\\",\\\"feeAsset\\\":\\\"BTC_TEST\\\",\\\"feeUsdRate\\\":\\\"61656.80383584493\\\",\\\"txAdditionalDetails\\\":{\\\"availableBalance\\\":\\\"0.00022192\\\",\\\"isAutoCalculatedGasLimit\\\":false},\\\"isGrossAmount\\\":true,\\\"enableCashOut\\\":false,\\\"txId\\\":\\\"c9355902-28e6-4af3-b0a3-a67eace05cea\\\",\\\"multiDestFormat\\\":false,\\\"srcSubType\\\":\\\"\\\",\\\"srcWalletId\\\":\\\"\\\",\\\"srcName\\\":\\\"Test 3\\\",\\\"amountNativeStr\\\":\\\"0.00022192\\\",\\\"amountUSD\\\":13.68287791,\\\"dstSubType\\\":\\\"\\\",\\\"dstWalletId\\\":\\\"\\\",\\\"dstName\\\":\\\"Test 1\\\",\\\"displayDstAddress\\\":\\\"tb1q42lz78hhrtehumacs963t7kftnlmygr6vsxzhd\\\",\\\"dstAddressType\\\":\\\"WHITELISTED\\\",\\\"destinations\\\":[{\\\"amountNative\\\":0.00022192,\\\"amountNativeStr\\\":\\\"0.00022192\\\",\\\"amountUSD\\\":13.68287791,\\\"dstAddressType\\\":\\\"WHITELISTED\\\",\\\"dstId\\\":\\\"1\\\",\\\"dstWalletId\\\":\\\"\\\",\\\"dstName\\\":\\\"Test 1\\\",\\\"dstSubType\\\":\\\"\\\",\\\"dstType\\\":\\\"VAULT\\\",\\\"displayDstAddress\\\":\\\"tb1q42lz78hhrtehumacs963t7kftnlmygr6vsxzhd\\\",\\\"action\\\":\\\"ALLOW\\\",\\\"actionInfo\\\":{\\\"capturedRuleNum\\\":0,\\\"rulesSnapshotId\\\":712,\\\"byGlobalPolicy\\\":false,\\\"byRule\\\":true,\\\"ruleType\\\":\\\"TENANT\\\",\\\"capturedRule\\\":\\\"{\\\\\\\"dst\\\\\\\":{\\\\\\\"ids\\\\\\\":[[\\\\\\\"*\\\\\\\"]]},\\\\\\\"src\\\\\\\":{\\\\\\\"ids\\\\\\\":[[\\\\\\\"*\\\\\\\"]]},\\\\\\\"type\\\\\\\":\\\\\\\"TRANSFER\\\\\\\",\\\\\\\"asset\\\\\\\":\\\\\\\"*\\\\\\\",\\\\\\\"action\\\\\\\":\\\\\\\"ALLOW\\\\\\\",\\\\\\\"amount\\\\\\\":0,\\\\\\\"operators\\\\\\\":{\\\\\\\"wildcard\\\\\\\":\\\\\\\"*\\\\\\\"},\\\\\\\"periodSec\\\\\\\":0,\\\\\\\"amountScope\\\\\\\":\\\\\\\"SINGLE_TX\\\\\\\",\\\\\\\"amountCurrency\\\\\\\":\\\\\\\"USD\\\\\\\",\\\\\\\"dstAddressType\\\\\\\":\\\\\\\"*\\\\\\\",\\\\\\\"applyForApprove\\\\\\\":false,\\\\\\\"transactionType\\\\\\\":\\\\\\\"TRANSFER\\\\\\\",\\\\\\\"designatedSigner\\\\\\\":\\\\\\\"b01df07d-bfa4-44fd-9954-80950b6a1731\\\\\\\",\\\\\\\"allowedAssetTypes\\\\\\\":\\\\\\\"FUNGIBLE\\\\\\\",\\\\\\\"externalDescriptor\\\\\\\":\\\\\\\"{\\\\\\\\\\\\\\\"id\\\\\\\\\\\\\\\":\\\\\\\\\\\\\\\"2fdac221-e774-4494-9b2c-3e1d53bb7b93\\\\\\\\\\\\\\\"}\\\\\\\"}\\\"}}],\\\"tenantId\\\":\\\"cc809d21-d88c-5763-845d-36219936ddf0\\\",\\\"userName\\\":\\\"maor sta\\\",\\\"userId\\\":\\\"f293b466-0609-5d7c-927c-8e6d64068d7b\\\",\\\"signerId\\\":\\\"b01df07d-bfa4-44fd-9954-80950b6a1731\\\",\\\"signerIds\\\":[\\\"b01df07d-bfa4-44fd-9954-80950b6a1731\\\"],\\\"action\\\":\\\"ALLOW\\\",\\\"actionInfo\\\":{\\\"capturedRuleNum\\\":0,\\\"rulesSnapshotId\\\":712,\\\"byGlobalPolicy\\\":false,\\\"byRule\\\":true,\\\"ruleType\\\":\\\"TENANT\\\",\\\"capturedRule\\\":\\\"{\\\\\\\"dst\\\\\\\":{\\\\\\\"ids\\\\\\\":[[\\\\\\\"*\\\\\\\"]]},\\\\\\\"src\\\\\\\":{\\\\\\\"ids\\\\\\\":[[\\\\\\\"*\\\\\\\"]]},\\\\\\\"type\\\\\\\":\\\\\\\"TRANSFER\\\\\\\",\\\\\\\"asset\\\\\\\":\\\\\\\"*\\\\\\\",\\\\\\\"action\\\\\\\":\\\\\\\"ALLOW\\\\\\\",\\\\\\\"amount\\\\\\\":0,\\\\\\\"operators\\\\\\\":{\\\\\\\"wildcard\\\\\\\":\\\\\\\"*\\\\\\\"},\\\\\\\"periodSec\\\\\\\":0,\\\\\\\"amountScope\\\\\\\":\\\\\\\"SINGLE_TX\\\\\\\",\\\\\\\"amountCurrency\\\\\\\":\\\\\\\"USD\\\\\\\",\\\\\\\"dstAddressType\\\\\\\":\\\\\\\"*\\\\\\\",\\\\\\\"applyForApprove\\\\\\\":false,\\\\\\\"transactionType\\\\\\\":\\\\\\\"TRANSFER\\\\\\\",\\\\\\\"designatedSigner\\\\\\\":\\\\\\\"b01df07d-bfa4-44fd-9954-80950b6a1731\\\\\\\",\\\\\\\"allowedAssetTypes\\\\\\\":\\\\\\\"FUNGIBLE\\\\\\\",\\\\\\\"externalDescriptor\\\\\\\":\\\\\\\"{\\\\\\\\\\\\\\\"id\\\\\\\\\\\\\\\":\\\\\\\\\\\\\\\"2fdac221-e774-4494-9b2c-3e1d53bb7b93\\\\\\\\\\\\\\\"}\\\\\\\"}\\\"}}\",\"txMetaDataSignatures\":[{\"id\":\"policy_service\",\"type\":\"SERVICE\",\"signature\":\"7ac4d587d7105a036398e46310192ad60d108e61de4e92edec80a527dd3af5922db3e68251686d74c060784bb7cdf44b106823e14b7e8ebe41cb5ed01bc9928acbaf1dd142fed0acdd3cbac91c217895fa4aac80879104cc3b74810528b593b242d2a2ee3a71e4e245e3b15553259968393a11e1d02a2354862aa3993f43abc2858d74a2f5c400eab40dd179c32b4b1010e6167bc8802f6e8374c3e1b4f4c53e8e7a075258ecb02838925b5f66b0e28b5f2e2f6d2ebd658e0ec7219fc7eac071d13178fff29fe60c04c3d1214b0447e6b8346c82a35db469b18b11f69d64c58a6a1411283fdbbfc776cfbd9cd1eb89800de20e541d4186c5bf2a3e9be901e023\"}],\"signInfo\":[{\"payload\":\"e73b141a9dfbdb655ac2771d8943a449154dfc13c00389bfec0f8c152851d7f9\",\"path\":[]},{\"payload\":\"ca78566537c33d273fd0082ab2728bc58de58df1f5edef019c5a7f8560b2fb2e\",\"path\":[]},{\"payload\":\"89b249002fc7113cac8cbf53a251431b73d82984c2655e4ffe8dccfcce2dba65\",\"path\":[]}],\"amountUSD\":\"13.68287791\"},\"algorithm\":\"ECDSA_SECP256K1\",\"type\":\"KEY_LINK_TX_SIGN_REQUEST\",\"signingDeviceKeyId\":\"62f657b5c88e523d7755f4c112afb27f5fda8d3bf3db2120e9c1e7e4cb86debe\",\"messagesToSign\":[{\"message\":\"e73b141a9dfbdb655ac2771d8943a449154dfc13c00389bfec0f8c152851d7f9\",\"index\":0},{\"message\":\"ca78566537c33d273fd0082ab2728bc58de58df1f5edef019c5a7f8560b2fb2e\",\"index\":1},{\"message\":\"89b249002fc7113cac8cbf53a251431b73d82984c2655e4ffe8dccfcce2dba65\",\"index\":2}]}",
              "payloadSignatureData": {
                  "service": "SIGNING_SERVICE",
                  "signature": "31aad030a3b7f174877ea9c3f6f5f0f03df486c149aa86b8e50402f47297897dda9a0faae933ef86f413635a154e0a068f06b63e85db8294a4185b56c26a82f120a3f479adf18e708f01e6222404faad074f1d578b75c6ac2ab46bcbe2832bccedb78ef9110cbef8350a8165423c9a2dde626d821887143b7f76d9ec886fa755a4728676cabc24aeb4275e258c739a616840649496925ff1f513e3c24b0f3c802d8d0a7bac29fc4de0bdbf30485890c7d7dc3cadbf71882f40341bac805321137030419aaebaaee765e40e51feb7a279ed053297421e34666048f0d2469a82b5f847d79628b3743d329429b9c158864f68c6f528d97691b8b6de23900403fadd"
              }
          },
          "transportMetadata": {
              "requestId": "c9355902-28e6-4af3-b0a3-a67eace05cea",
              "type": "KEY_LINK_TX_SIGN_REQUEST"
          }
      }
  ]
}
```

#### KEY_LINK_TX_SIGN_REQUEST (XRP_TEST - Single Message to Sign)
```json
{
  "messages": [
    {
        "message": {
            "payload": "{\"tenantId\":\"cc809d21-d88c-5763-845d-36219936ddf0\",\"txId\":\"aa456e65-3aea-4bbb-9d90-f5cb8d833b1c\",\"keyId\":\"b1e88fe3-bddf-418a-93e0-450121aa92ee\",\"userAccessToken\":\"eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJBQ1RJVkFURV9WQVVMVF9XQUxMRVQiOiJ0cnVlIiwiQUREX1JFTU9WRV9FWENIQU5HRV9BQ0NPVU5UIjoidHJ1ZSIsIkFERF9SRU1PVkVfTkVUV09SS19DT05ORUNUSU9OIjoidHJ1ZSIsIkFERF9SRU1PVkVfVU5NQU5BR0VEX1dBTExFVCI6InRydWUiLCJBRERfUkVNT1ZFX1ZBVUxUX0FDQ09VTlQiOiJ0cnVlIiwiQ0FOQ0VMX1RSQU5TRkVSIjoidHJ1ZSIsIkRPTlRfVFJBTlNGRVIiOiJ0cnVlIiwiRVhDSEFOR0VfQ0FQQUJJTElUSUVTIjoidHJ1ZSIsIkVYQ0hBTkdFX0NPTlZFUlNJT04iOiJ0cnVlIiwiRVhDSEFOR0VfSU5URVJOQUxfVFJBTlNGRVIiOiJ0cnVlIiwiRVhDSEFOR0VfT1JERVIiOiJ0cnVlIiwiRkVFX0JBTktfVFJBTlNGRVIiOiJ0cnVlIiwiR0VUX0RFUE9TSVRfQUREUkVTUyI6InRydWUiLCJHRVRfRVhDSEFOR0VfQkFMQU5DRSI6InRydWUiLCJHRVRfRVhDSEFOR0VfS0VZIjoidHJ1ZSIsIkdFVF9FWFRFUk5BTF9LRVlTIjoidHJ1ZSIsIkdFVF9GRUVfSU5GTyI6InRydWUiLCJHRVRfTkVXX0FERFJFU1MiOiJ0cnVlIiwiR0VUX1BFUk1BTkVOVF9BRERSRVNTIjoidHJ1ZSIsIkdFVF9QVUJLRVlfSU5GTyI6InRydWUiLCJHRVRfU0lHTkVSUyI6InRydWUiLCJHRVRfU1VQUE9SVEVEX1RSQURJTkdfTUVUSE9EUyI6InRydWUiLCJHRVRfVkFMSURBVElPTl9LRVkiOiJ0cnVlIiwiSU5JVElBVEVfVFJBTlNGRVIiOiJ0cnVlIiwiSU5URVJOQUxfQUNDT1VOVF9UUkFOU0ZFUiI6InRydWUiLCJJTlRFUk5BTF9MRURHRVJfVFJBTlNGRVJfQ0FOQ0VMIjoidHJ1ZSIsIklOVEVSTkFMX0xFREdFUl9UUkFOU0ZFUl9JU1NVRSI6InRydWUiLCJJU1NVRV9ERVZJQ0VfUEFJUklOR19UT0tFTiI6InRydWUiLCJOQ1dfR0VUX1RFTkFOVF9JTkZPIjoidHJ1ZSIsIk9FQ19SRVFVRVNUX1NFVFRMRSI6InRydWUiLCJRVUVSWV9UUkFOU0ZFUl9QRUVSU19HUk9VUFMiOiJ0cnVlIiwiUVVFUllfVVNFUlNfR1JPVVBTIjoidHJ1ZSIsIlJFR0lTVEVSX0VYVEVSTkFMX0tFWSI6InRydWUiLCJSRUdJU1RFUl9WQUxJREFUSU9OX0tFWSI6InRydWUiLCJTRVRfTkVUV09SS19DT05ORUNUSU9OX1JPVVRJTkciOiJ0cnVlIiwiVFJBTlNGRVIiOiJ0cnVlIiwiVFJBTlNGRVJfQVNTSVNUX1JFUVVFU1QiOiJ0cnVlIiwiZXhwIjoxNzE5ODQ3NDc5LCJpYXQiOjE3MTk3NjEwNzksIm9wSWQiOiJhYTQ1NmU2NS0zYWVhLTRiYmItOWQ5MC1mNWNiOGQ4MzNiMWMiLCJvcFR5cGUiOiJUUkFOU0ZFUiIsInJvbGUiOiJTSUdORVIiLCJ0ZW5hbnRJZCI6ImNjODA5ZDIxLWQ4OGMtNTc2My04NDVkLTM2MjE5OTM2ZGRmMCIsInR5cGUiOiJBUEkiLCJ1c2VySWQiOiJiMDFkZjA3ZC1iZmE0LTQ0ZmQtOTk1NC04MDk1MGI2YTE3MzEiLCJ1c2VyX2IwMWRmMDdkLWJmYTQtNDRmZC05OTU0LTgwOTUwYjZhMTczMSI6ImIwMWRmMDdkLWJmYTQtNDRmZC05OTU0LTgwOTUwYjZhMTczMSJ9.AmdOYyjvXfA2ENlJWjCaPaTyJi7_h7IQ_R-QqZomMrcclU6nQkOsZFGOqRBRODt0vBL39NO00qcVhJqvbaadFFrmXaz74jUfikqIkGge4ppFkBY3WHQejb2nlbpx9V7sFyVZFBUqWRQ0m7luFeEsX2o2s7x8NkxNaLjPquouVXmKJc5JjGh9c6g8QSJUi_qA05tVzCN2TRyWAnccfZBQOgyUVyU853JHQECbjNCkfeD8gecxhB9WGFXZRkeCDmu9gJdtKWfwYMxZuCcn4xf9t6QphAR5slttYbwGoWnFhMhD05duKXi31yiuDAvLPzgqZBhSE_zfcrVNVTQFWYXfad2WA_ZLwSk6St8bVx4JQgTIb3gI88ksCNTSJJ5nYt1tR0haZPKsWAuhgB7xMqvSwuQfjubCQKRgARvt2Kh4fXKr9AOo4YD4m4jjdximVd2ZSMqU5SgkDb7T-nuQeDUomrmzbtPaDkvlLpE6GadvvO8B2oKAV0YQLabP5S-p_JIrva-6fhrtYIcxgyAQKR_-NB-CLeBD72YKBeBlPrrxAb0w5k5wirYZRTCOCzpXrEV-oSLpIkM-r_LCpczDPZD2UuIju-HlpmHHvafTAkmwaP8iRB0pkDaBArb7EojKXRSrYaNNi8OclQoz5jkL5r51jxuGthc3omY2CviM1j8X8O0\",\"metadata\":{\"asset\":\"XRP_TEST\",\"amountStr\":\"20.000000\",\"amount\":20.00000000,\"amountInt\":\"20000000\",\"destId\":\"2\",\"srcId\":1,\"srcType\":\"VAULT\",\"destType\":\"VAULT\",\"dstAddress\":\"rfsMEENCKdhLWk6x3caZzdDvPU5X1AmH5L\",\"fee\":15,\"coinbaseFee\":\"0.000015\",\"sequence\":1856262,\"chaincode\":\"0000000000000000000000000000000000000000000000000000000000000000\",\"txMetaData\":\"{\\\"asset\\\":\\\"XRP_TEST\\\",\\\"amountNative\\\":20.00000000,\\\"srcType\\\":\\\"VAULT\\\",\\\"srcId\\\":\\\"1\\\",\\\"dstId\\\":\\\"2\\\",\\\"dstType\\\":\\\"VAULT\\\",\\\"transactionType\\\":\\\"TRANSFER\\\",\\\"feeLevel\\\":\\\"MEDIUM\\\",\\\"feeAsset\\\":\\\"XRP_TEST\\\",\\\"txAdditionalDetails\\\":{\\\"availableBalance\\\":\\\"79.999985\\\",\\\"isAutoCalculatedGasLimit\\\":false},\\\"isGrossAmount\\\":false,\\\"enableCashOut\\\":false,\\\"txId\\\":\\\"aa456e65-3aea-4bbb-9d90-f5cb8d833b1c\\\",\\\"multiDestFormat\\\":false,\\\"srcSubType\\\":\\\"\\\",\\\"srcWalletId\\\":\\\"\\\",\\\"srcName\\\":\\\"Test 1\\\",\\\"amountNativeStr\\\":\\\"20\\\",\\\"amountUSD\\\":2000.00000000,\\\"dstSubType\\\":\\\"\\\",\\\"dstWalletId\\\":\\\"\\\",\\\"dstName\\\":\\\"Test 2\\\",\\\"displayDstAddress\\\":\\\"rfsMEENCKdhLWk6x3caZzdDvPU5X1AmH5L\\\",\\\"displayDstTag\\\":\\\"1554320970\\\",\\\"dstAddressType\\\":\\\"WHITELISTED\\\",\\\"destinations\\\":[{\\\"amountNative\\\":20.00000000,\\\"amountNativeStr\\\":\\\"20\\\",\\\"amountUSD\\\":2000.00000000,\\\"dstAddressType\\\":\\\"WHITELISTED\\\",\\\"dstId\\\":\\\"2\\\",\\\"dstWalletId\\\":\\\"\\\",\\\"dstName\\\":\\\"Test 2\\\",\\\"dstSubType\\\":\\\"\\\",\\\"dstType\\\":\\\"VAULT\\\",\\\"displayDstAddress\\\":\\\"rfsMEENCKdhLWk6x3caZzdDvPU5X1AmH5L\\\",\\\"displayDstTag\\\":\\\"1554320970\\\",\\\"action\\\":\\\"ALLOW\\\",\\\"actionInfo\\\":{\\\"capturedRuleNum\\\":0,\\\"rulesSnapshotId\\\":712,\\\"byGlobalPolicy\\\":false,\\\"byRule\\\":true,\\\"ruleType\\\":\\\"TENANT\\\",\\\"capturedRule\\\":\\\"{\\\\\\\"dst\\\\\\\":{\\\\\\\"ids\\\\\\\":[[\\\\\\\"*\\\\\\\"]]},\\\\\\\"src\\\\\\\":{\\\\\\\"ids\\\\\\\":[[\\\\\\\"*\\\\\\\"]]},\\\\\\\"type\\\\\\\":\\\\\\\"TRANSFER\\\\\\\",\\\\\\\"asset\\\\\\\":\\\\\\\"*\\\\\\\",\\\\\\\"action\\\\\\\":\\\\\\\"ALLOW\\\\\\\",\\\\\\\"amount\\\\\\\":0,\\\\\\\"operators\\\\\\\":{\\\\\\\"wildcard\\\\\\\":\\\\\\\"*\\\\\\\"},\\\\\\\"periodSec\\\\\\\":0,\\\\\\\"amountScope\\\\\\\":\\\\\\\"SINGLE_TX\\\\\\\",\\\\\\\"amountCurrency\\\\\\\":\\\\\\\"USD\\\\\\\",\\\\\\\"dstAddressType\\\\\\\":\\\\\\\"*\\\\\\\",\\\\\\\"applyForApprove\\\\\\\":false,\\\\\\\"transactionType\\\\\\\":\\\\\\\"TRANSFER\\\\\\\",\\\\\\\"designatedSigner\\\\\\\":\\\\\\\"b01df07d-bfa4-44fd-9954-80950b6a1731\\\\\\\",\\\\\\\"allowedAssetTypes\\\\\\\":\\\\\\\"FUNGIBLE\\\\\\\",\\\\\\\"externalDescriptor\\\\\\\":\\\\\\\"{\\\\\\\\\\\\\\\"id\\\\\\\\\\\\\\\":\\\\\\\\\\\\\\\"2fdac221-e774-4494-9b2c-3e1d53bb7b93\\\\\\\\\\\\\\\"}\\\\\\\"}\\\"}}],\\\"tenantId\\\":\\\"cc809d21-d88c-5763-845d-36219936ddf0\\\",\\\"userName\\\":\\\"maor sta\\\",\\\"userId\\\":\\\"f293b466-0609-5d7c-927c-8e6d64068d7b\\\",\\\"signerId\\\":\\\"b01df07d-bfa4-44fd-9954-80950b6a1731\\\",\\\"signerIds\\\":[\\\"b01df07d-bfa4-44fd-9954-80950b6a1731\\\"],\\\"action\\\":\\\"ALLOW\\\",\\\"actionInfo\\\":{\\\"capturedRuleNum\\\":0,\\\"rulesSnapshotId\\\":712,\\\"byGlobalPolicy\\\":false,\\\"byRule\\\":true,\\\"ruleType\\\":\\\"TENANT\\\",\\\"capturedRule\\\":\\\"{\\\\\\\"dst\\\\\\\":{\\\\\\\"ids\\\\\\\":[[\\\\\\\"*\\\\\\\"]]},\\\\\\\"src\\\\\\\":{\\\\\\\"ids\\\\\\\":[[\\\\\\\"*\\\\\\\"]]},\\\\\\\"type\\\\\\\":\\\\\\\"TRANSFER\\\\\\\",\\\\\\\"asset\\\\\\\":\\\\\\\"*\\\\\\\",\\\\\\\"action\\\\\\\":\\\\\\\"ALLOW\\\\\\\",\\\\\\\"amount\\\\\\\":0,\\\\\\\"operators\\\\\\\":{\\\\\\\"wildcard\\\\\\\":\\\\\\\"*\\\\\\\"},\\\\\\\"periodSec\\\\\\\":0,\\\\\\\"amountScope\\\\\\\":\\\\\\\"SINGLE_TX\\\\\\\",\\\\\\\"amountCurrency\\\\\\\":\\\\\\\"USD\\\\\\\",\\\\\\\"dstAddressType\\\\\\\":\\\\\\\"*\\\\\\\",\\\\\\\"applyForApprove\\\\\\\":false,\\\\\\\"transactionType\\\\\\\":\\\\\\\"TRANSFER\\\\\\\",\\\\\\\"designatedSigner\\\\\\\":\\\\\\\"b01df07d-bfa4-44fd-9954-80950b6a1731\\\\\\\",\\\\\\\"allowedAssetTypes\\\\\\\":\\\\\\\"FUNGIBLE\\\\\\\",\\\\\\\"externalDescriptor\\\\\\\":\\\\\\\"{\\\\\\\\\\\\\\\"id\\\\\\\\\\\\\\\":\\\\\\\\\\\\\\\"2fdac221-e774-4494-9b2c-3e1d53bb7b93\\\\\\\\\\\\\\\"}\\\\\\\"}\\\"}}\",\"txMetaDataSignatures\":[{\"id\":\"policy_service\",\"type\":\"SERVICE\",\"signature\":\"b3fd0615466b6cbb929eda6353fe4c216b638fd23f3c1bd78beab45644680c57ba9f17727f10306707f3bcc2d1c21e161e4215830984010b6827a05e8678f73b5b872f9cc920c17daa31ae8a0d4222ae86c197f36126a2d0452a163220accfbc2fa77596b1758ee4db06925b778ec2aecba0bd5b898f6cd68448ce75d9e830ab60bafff2c9d1f01c24cd657cfb7bc4f3ef86b41a687a4efe05d03ef2df1eed6a34e3d67674d0d985b6559a0c8d1afd01a4a9ef375a2a3207d8846af112f4da567513280b0756b233d055bf3f1f1143ea8b7682d4a2b20a16981ec7bcc479b36f05fcee1e26682f861d422be7835392dd6e59945974085059b812a0bc28679955\"}],\"transactionType\":\"TRANSFER\",\"tokenBlockchainId\":\"\",\"tokenSymbol\":\"\",\"signInfo\":[{\"path\":[],\"payload\":\"02d5afae9b1104e36cd059d72880d1ba54bdc26e8a63c88eeb7e0ce2aa996051\"}],\"amountUSD\":\"2000.00000000\"},\"algorithm\":\"ECDSA_SECP256K1\",\"type\":\"KEY_LINK_TX_SIGN_REQUEST\",\"signingDeviceKeyId\":\"d8fbd4b4149faa60588ee983b1870d1882b68f263ba726bb1bc4ef5f7f1bbb89\",\"messagesToSign\":[{\"message\":\"02d5afae9b1104e36cd059d72880d1ba54bdc26e8a63c88eeb7e0ce2aa996051\",\"index\":0}]}",
            "payloadSignatureData": {
                "service": "SIGNING_SERVICE",
                "signature": "2343add353a41d19eb630db6d4bd92e49867c6821102b886f7bead13793bffb842e55c9d9b75f837fc419e99fd2a72932d8b38567ec54554edd124f0118ad9c4a14ad97620a399f10b0c3878fac54550371f05a53501db614715f4ff3d31c27f84827021b8a766b02b4bcc429537e73a4d5c2ca9d971bc3b08fa643dfdf9221351c2e4d3df46c7afaa2f9e94e830ecb19ff667096e3b069fdb7bd21dccfbef714807ee61e6ad1cfe9f85da1dd6a8314046a10607c311497de934aa2e67e458c07de1a8099f94eec562f7793f9a026ed54bf4da74b38c5afa53d52f8f291f2b3670f9a2064fb552070586edc9dde6d5276bc7c45d1a961acebb099324bc3ee7e8"
            }
        },
        "transportMetadata": {
            "requestId": "aa456e65-3aea-4bbb-9d90-f5cb8d833b1c",
            "type": "KEY_LINK_TX_SIGN_REQUEST"
        }
    }
]
}
```

### MessagesStatusRequest Example

```json
{
  "requestIds": ["c9355902-28e6-4af3-b0a3-a67eace05cea", "fdfd1256-a2b7-4d39-bdee-677fe9ca4516"]
}
```

### MessagesStatusResponse Examples

#### KEY_LINK_PROOF_OF_OWNERSHIP_RESPONSE

```json
{
  "statuses": [
    {
      "requestId": "fdfd1256-a2b7-4d39-bdee-677fe9ca4516",
      "status": "SIGNED",
      "type": "KEY_LINK_PROOF_OF_OWNERSHIP_RESPONSE",
      "response": {
        "signedMessages": [
          {
            "index": 0,
            "signature": "78899d447de2de1c11cac2229e17b1fc065e1428546eb481bf5c63494c3c1b018113c54563cbebbef6a418d94ff5538634e670a7321166be9fcadec303065d0b",
            "message": "0b3d17a5567433d0b7726572d53abe8ded14b361b6a27ab3188f20c2bbdee838"
          }
        ]
      }
    }
  ]
}
```

#### KEY_LINK_TX_SIGN_RESPONSE (BTC - UTXO Multiple Inputs)

```json
{
  "type": "KEY_LINK_TX_SIGN_RESPONSE",
  "status": "SIGNED",
  "requestId": "c9355902-28e6-4af3-b0a3-a67eace05cea",
  "response": {
    "signedMessages": [
      {
        "index": 0,
        "signature": "7832bfe7be9c381e5cd7203c52ff382062ae51ff81a408467ae3c3252e153b8d12c905eb98c37111df97aaa0aafe4c5216ace3ace1eab68058cbfccd27cfe134",
        "message": "e73b141a9dfbdb655ac2771d8943a449154dfc13c00389bfec0f8c152851d7f9"
      },
      {
        "index": 1,
        "signature": "8f7f33683ab96f2778dfba6b7df3b72e09074133bcf881f8fdf6b1effd8fdd9a6b7762b1005511a2c334007168234fc11f0a5ecc6c2b03d4524281526ad349b0",
        "message": "ca78566537c33d273fd0082ab2728bc58de58df1f5edef019c5a7f8560b2fb2e"
      },
      {
        "index": 2,
        "signature": "5527109e5a05bf178944692750f884ecdbbac329646fd3ef7ba2484c2de69ffc33c385c6db186b85ce50802676a1a727325c9d72a56001d0bb388fb4216a638f",
        "message": "89b249002fc7113cac8cbf53a251431b73d82984c2655e4ffe8dccfcce2dba65"
      }
    ]
  }
}
```
#### KEY_LINK_TX_SIGN_RESPONSE (XRP_TEST - Single Message to Sign)
```json
{
    "type": "KEY_LINK_TX_SIGN_RESPONSE",
    "status": "SIGNED",
    "requestId": "aa456e65-3aea-4bbb-9d90-f5cb8d833b1c",
    "response": {
        "signedMessages": [
            {
                "index": 0,
                "signature": "4ebfb539ca767977ead891471c5d5f49aee7ef7c825fc13e0df524e0ee23fc58dccc86b0247dcfa9e6b82922c87acec20f37538d03215ea30102ef2d26a795a9",
                "message": "02d5afae9b1104e36cd059d72880d1ba54bdc26e8a63c88eeb7e0ce2aa996051"
            }
        ]
    }
}
```
---