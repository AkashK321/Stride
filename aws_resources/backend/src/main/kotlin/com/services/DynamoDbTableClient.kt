package com.services

import software.amazon.awssdk.auth.credentials.EnvironmentVariableCredentialsProvider
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import software.amazon.awssdk.services.dynamodb.model.AttributeValue
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest
import software.amazon.awssdk.services.dynamodb.model.ScanRequest
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient

/**
 * Modular client for interacting with a specific DynamoDB table.
 * Instantiating this class creates a wrapper for the specific table,
 * while sharing the underlying AWS SDK client connection pool.
 *
 * @param tableName The name of the DynamoDB table this client will interact with
 * @param primaryKeyName The name of the primary key attribute for this table
 */
class DynamoDbTableClient(private val tableName: String, private val primaryKeyName: String = "id") {

    companion object {
        // Share the heavyweight SDK client across all TableClient instances to reuse HTTP connections
        private val sdkClient: DynamoDbClient by lazy {
            DynamoDbClient.builder()
                .region(Region.US_EAST_1)
                .credentialsProvider(EnvironmentVariableCredentialsProvider.create())
                .httpClient(UrlConnectionHttpClient.create())
                .build()
        }
    }

    /**
     * Scans the entire table and returns a list of items.
     * Useful for loading configuration maps
     */
    fun scanAll(): List<Map<String, String>> {
        val itemsList = mutableListOf<Map<String, String>>()
        try {
            val request = ScanRequest.builder()
                .tableName(tableName)
                .build()

            val response = sdkClient.scan(request)

            response.items().forEach { item ->
                // Convert DynamoDB AttributeValue to simple String map
                val simpleMap = item.entries.associate { (key, value) ->
                    val strValue = value.s() ?: value.n() ?: value.bool()?.toString() ?: ""
                    key to strValue
                }
                itemsList.add(simpleMap)
            }
        } catch (e: Exception) {
            println("Error scanning table $tableName: ${e.message}")
            e.printStackTrace()
        }
        return itemsList
    }

    fun getStringItem(itemName: String): Any? {
        try {
            val key = mapOf(primaryKeyName to AttributeValue.builder().s(itemName).build())

            val request = GetItemRequest.builder()
                .tableName(tableName)
                .key(key)
                .build()

            val response = sdkClient.getItem(request)

            if (!response.hasItem()) {
                return null
            }

            val item = response.item()
            val attr = item["value"] ?: return null

            return when {
                attr.bool() != null -> attr.bool()
                attr.n() != null -> {
                    val numStr = attr.n()
                    if (numStr.contains(".")) numStr.toDouble() else numStr.toLong()
                }
                attr.s() != null -> attr.s()
                else -> null
            }  
        } catch (e: Exception) {
            println("Error getting item '$itemName' from table $tableName: ${e.message}")
            return null
        }
    }
}