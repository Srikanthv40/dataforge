import { html, render } from 'lit-html';

export function renderEntityRelationshipDiagram(schemaData) {
  const diagramContent = document.getElementById("diagram-content");
  
  if (!diagramContent) return console.warn("Diagram content element not found");
  
  if (!schemaData?.schemas?.length) {
    return render(html`<div class="alert alert-info">Loading schema data for diagram...</div>`, diagramContent);
  }
  
  if (!document.getElementById("myDiagramDiv")) {
    render(html`
      <div id="myDiagramDiv" style="border: 1px solid #d3d3d3; width: 100%; height: 600px; position: relative;"></div>
      <div class="mt-3">
        <button id="zoomToFit" class="btn btn-sm btn-outline-secondary">Zoom to Fit</button>
        <button id="centerRoot" class="btn btn-sm btn-outline-secondary ms-2">Center on Root</button>
      </div>
    `, diagramContent);
    setTimeout(() => initDiagram(schemaData), 0);
  } else {
    updateDiagram(schemaData);
  }
}

function initDiagram(schemaData) {
  if (!window.go) {
    const diagramDiv = document.getElementById("myDiagramDiv");
    if (diagramDiv) diagramDiv.innerHTML = '<div class="alert alert-danger">GoJS library not loaded.</div>';
    return;
  }
  
  if (window.myDiagram) return updateDiagram(schemaData);
  
  const $ = window.go.GraphObject.make;
  
  window.myDiagram = $(go.Diagram, "myDiagramDiv", {
    initialContentAlignment: go.Spot.Center,
    "undoManager.isEnabled": true,
    layout: $(go.ForceDirectedLayout, { defaultSpringLength: 100, defaultElectricalCharge: 100 })
  });
  
  window.myDiagram.nodeTemplate = $(go.Node, "Auto", 
    { locationSpot: go.Spot.Center, fromSpot: go.Spot.AllSides, toSpot: go.Spot.AllSides },
    $(go.Shape, "Rectangle", { fill: "white", stroke: "#00A9C9", strokeWidth: 2 }),
    $(go.Panel, "Table", { margin: 8, stretch: go.GraphObject.Fill },
      $(go.RowColumnDefinition, { row: 0, sizing: go.RowColumnDefinition.None }),
      $(go.TextBlock, { row: 0, alignment: go.Spot.Center, margin: new go.Margin(0, 14, 0, 2), font: "bold 16px sans-serif" }, 
        new go.Binding("text", "name")),
      $(go.Panel, "Vertical", { 
        row: 1, padding: 3, alignment: go.Spot.TopLeft, defaultAlignment: go.Spot.Left, stretch: go.GraphObject.Fill,
        itemTemplate: $(go.Panel, "Horizontal", { stretch: go.GraphObject.Fill, margin: 2 },
          $(go.TextBlock, { stroke: "#333333", font: "12px sans-serif" }, new go.Binding("text", "name")),
          $(go.TextBlock, { stroke: "#777777", font: "12px sans-serif", margin: new go.Margin(0, 0, 0, 5) }, 
            new go.Binding("text", "info")))
      }, new go.Binding("itemArray", "items"))
    )
  );
  
  window.myDiagram.linkTemplate = $(go.Link,
    { routing: go.Link.AvoidsNodes, curve: go.Link.JumpOver, corner: 5, toShortLength: 4 },
    $(go.Shape, { strokeWidth: 1.5 }),
    $(go.Shape, { toArrow: "Standard", stroke: null }),
    $(go.Panel, "Auto",
      $(go.Shape, "RoundedRectangle", { fill: "white", stroke: "#00A9C9" }),
      $(go.TextBlock, { margin: 5 }, new go.Binding("text", "text"))
    )
  );
  
  updateDiagram(schemaData);
  
  document.getElementById("zoomToFit")?.addEventListener("click", () => window.myDiagram.commandHandler.zoomToFit());
  document.getElementById("centerRoot")?.addEventListener("click", () => {
    window.myDiagram.scale = 1.0;
    const nodes = window.myDiagram.model.nodeDataArray;
    if (nodes.length > 0) window.myDiagram.scrollToRect(window.myDiagram.findNodeForKey(nodes[0].key).actualBounds);
  });
}

function updateDiagram(schemaData) {
  if (!window.myDiagram) return initDiagram(schemaData);
  if (!schemaData?.schemas) return;
  
  const nodeDataArray = [];
  const linkDataArray = [];
  
  schemaData.schemas.forEach(schema => {
    const items = schema.columns?.map(col => ({
      name: col.name,
      info: `${col.dataType || ""}${col.isPrimaryKey ? " (PK)" : ""}${col.isForeignKey ? " (FK)" : ""}`
    })) || [];
    
    nodeDataArray.push({ key: schema.tableName, name: schema.tableName, items });
    
    schema.columns?.forEach(col => {
      if (col.isForeignKey && col.foreignKeyReference?.referencedTable) {
        linkDataArray.push({
          from: schema.tableName,
          to: col.foreignKeyReference.referencedTable,
          text: `FK: ${col.name} → ${col.foreignKeyReference.referencedColumn}`
        });
      }
    });
  });
  
  schemaData.relationships?.forEach(rel => {
    if (rel.fromTable && rel.toTable) {
      linkDataArray.push({
        from: rel.fromTable,
        to: rel.toTable,
        text: `${rel.relationshipType || 'Relationship'}: ${rel.fromColumn || ''} → ${rel.toColumn || ''}`
      });
    }
  });
  
  if (linkDataArray.length === 0 && nodeDataArray.length > 1) {
    for (let i = 0; i < nodeDataArray.length - 1; i++) {
      const table1 = nodeDataArray[i].name.toLowerCase();
      const table2 = nodeDataArray[i + 1].name.toLowerCase();
      if (table1.includes(table2) || table2.includes(table1)) {
        linkDataArray.push({ from: nodeDataArray[i].key, to: nodeDataArray[i + 1].key, text: "Inferred" });
        break;
      }
    }
    if (linkDataArray.length === 0) {
      linkDataArray.push({ from: nodeDataArray[0].key, to: nodeDataArray[1].key, text: "Default" });
    }
  }
  
  window.myDiagram.model = new go.GraphLinksModel(nodeDataArray, linkDataArray);
} 