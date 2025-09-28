I need you to analyze this tabular data and generate a detailed schema with relational information.

File Name: ${fileData.name}
File Type: ${fileData.type}

${fileData.sheets}${globalTableRules}

For each sheet/table, please analyze and provide:

IMPORTANT: If Global Table Classification Rules are provided above, follow these rules when analyzing and classifying all tables. Incorporate these rules into your table descriptions and classifications.

1. **Column Analysis** (for each column):
   - Inferred data type
   - Column description (incorporating global classification rules if provided)
   - Whether it might contain PII/sensitive data (true/false)
   - Any data quality observations
   - Suggested constraints or validation rules
   - Whether it could be a primary key candidate
   - Whether it could be a foreign key (referencing another table)

2. **Relationship Analysis**:
   - Identify potential primary keys for each table
   - Identify potential foreign key relationships between tables
   - Suggest join patterns and relationships
   - Identify lookup/reference tables vs fact tables
   - Note any hierarchical relationships

3. **Data Modeling Insights**:
   - Table classification (fact, dimension, lookup, bridge, etc.)
   - Suggested table relationships (one-to-one, one-to-many, many-to-many)
   - Potential composite keys
   - Normalization recommendations

IMPORTANT: The relationships section is critical for visualizing an entity-relationship diagram. Always include at least one relationship between tables when possible. For each relationship, ensure you specify the fromTable, toTable, fromColumn, and toColumn fields.

Please structure your response as a JSON object with the following format:
{
  "schemas": [
    {
      "sheetName": "Sheet1",
      "tableName": "suggested_table_name",
      "description": "Description of this table/data (incorporating global classification rules if provided)",
      "tableType": "fact|dimension|lookup|bridge",
      "primaryKey": {
        "columns": ["column1", "column2"],
        "type": "simple|composite",
        "confidence": "high|medium|low"
      },
      "columns": [
        {
          "name": "column_name",
          "dataType": "inferred_type",
          "description": "column description",
          "isPII": boolean,
          "isPrimaryKey": boolean,
          "isForeignKey": boolean,
          "qualityObservations": ["observation1", "observation2"],
          "constraints": ["constraint1", "constraint2"],
          "flags": [
            { "label": "CUSTOM_FLAG", "class": "bg-secondary" }
          ],
          "foreignKeyReference": {
            "referencedTable": "table_name",
            "referencedColumn": "column_name",
            "confidence": "high|medium|low"
          }
        }
      ]
    }
  ],
  "relationships": [
    {
      "fromTable": "table1",
      "fromColumn": "column1", 
      "toTable": "table2",
      "toColumn": "column2",
      "relationshipType": "one-to-one|one-to-many|many-to-many",
      "joinType": "inner|left|right|full",
      "confidence": "high|medium|low",
      "description": "Description of the relationship"
    }
  ],
  "suggestedJoins": [
    {
      "description": "Common join pattern description",
      "sqlPattern": "SELECT * FROM table1 t1 JOIN table2 t2 ON t1.key = t2.key",
      "tables": ["table1", "table2"],
      "useCase": "What this join would be used for"
    }
  ],
  "modelingRecommendations": [
    "Recommendation 1 about data modeling",
    "Recommendation 2 about normalization",
    "Recommendation 3 about performance"
  ]
}