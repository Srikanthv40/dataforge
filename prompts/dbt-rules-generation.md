Based on the following schema information with relationships, generate comprehensive DBT rules including models, tests, and configurations.

Schema Data: ${schemaData}

CRITICAL: Only create tests for column names that ACTUALLY EXIST in the schema data. Do NOT create tests for inferred or expected column names.

IMPORTANT: All SQL models must reference seeds using {{ ref('SEED_NAME') }} format. Do NOT use table names or add '_seed' suffix. The seed name will be the sanitized dataset name.

 In the JSON output, for tests:
    1. Do NOT output a "test" property with a string value.
    2. Instead, the test name itself must be the key, with its arguments as a dictionary.
      Example: { "dbt_utils.expression_is_true": { "expression": "patient_id > 0" } }
    3. If the test has no arguments, output an empty object {}.
    4. For accepted_values tests, the "values" must be inside an object: { "accepted_values": { "values": ["M","F","O"] } }
    5. For relationships tests, output: { "relationships": { "to": "ref('target_table')", "field": "target_column" } }; If the column is from a seed, keep its not_null, unique, etc. in either the seeds: section or the models: section — not both.

For each table/schema, please provide:
1. A DBT model definition that ONLY references seeds using {{ ref('seed_name') }} format - never use raw table names or _seed suffix
2. ONLY create tests for columns that exist in the actual schema data provided - verify column names exist before creating tests
3. Documentation configurations  
4. Any recommended materialization strategy

Include appropriate tests like:
- not_null (especially for primary keys and required foreign keys)
- unique (for primary keys and unique constraints) 
- accepted_values (for categorical data)
- relationships (for foreign key validation using the identified relationships)
- custom tests where appropriate for data quality

VALIDATION REQUIREMENT: Before creating any test, verify the column name exists in the schema data. Do not create tests for non-existent columns.

For identified relationships:
- Generate relationships tests to validate foreign key constraints
- Include referential integrity tests
- Add tests for orphaned records if applicable

Please structure your response as a JSON object with the following format:
{
  "dbtRules": [
    {
      "tableName": "table_name",
      "modelSql": "-- SQL for the model with proper joins and references",
      "yamlConfig": "# YAML configuration for the model including tests, docs, and relationships, but no comments",
      "tests": [
        {
          "column": "column_name", 
          "tests": ["test1", "test2"],
          "relationships": [
            {
              "test": "relationships",
              "to": "ref('target_table')",
              "field": "target_column"
            }
          ]
        }
      ],
      "recommendations": ["recommendation1", "recommendation2"],
      "materialization": "table|view|incremental|ephemeral",
      "relationships": [
        {
          "description": "Relationship description",
          "joinLogic": "SQL join logic for this relationship"
        }
      ]
    }
  ],
  "globalRecommendations": [
    "Overall DBT project recommendations",
    "Performance optimization suggestions",
    "Data quality strategy recommendations"
  ],
  "summary": "A concise summary of the generated DBT rules for both technical and non-technical users."
}