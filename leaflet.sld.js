(function() {

// default Path style applied if nothing matches
var defaultStyle = {
   stroke: true,
   color: "#03f00",
   weight: 0,
   opacity: 1,
   fillOpacity: 1,
   fillColor: '#03f00',
   strokeOpacity: 1,
   strokeWidth: 1,
   strokeDashstyle: "solid",
   pointRadius: 3,
   dashArray: null,
   lineJoin: null,
   lineCap: null,
};


// default Path style applied if nothing matches
var voidStyle = {
   color: false,
   fill: false
};
// attributes converted to numeric values
var numericAttributes = ['weight', 'opacity', 'fillOpacity', 'strokeOpacity'];

// mapping between SLD attribute names and SVG names
var attributeNameMapping = {
   'stroke': 'color',
   'stroke-width': 'weight',
   'stroke-opacity': 'opacity',
   'fill-opacity': 'fillOpacity',
   'fill': 'fillColor',
   'stroke-opacity': 'strokeOpacity',
   'stroke-dasharray': 'dashArray',
   //strokeDashstyle,
   //pointRadius,
   'stroke-linejoin': 'lineJoin',
   'stroke-linecap': 'lineCap',
   'size': 'radius'
};

// mapping SLD operators to shortforms
var comparisionOperatorMapping = {
   'ogc:PropertyIsEqualTo': '==',
   'ogc:PropertyIsNotEqualTo': '!=',
   'ogc:PropertyIsLessThan': '<',
   'ogc:PropertyIsGreaterThan': '>',
   'ogc:PropertyIsLessThanOrEqualTo': '<=',
   'ogc:PropertyIsGreaterThanOrEqualTo': '>=',
   //'ogc:PropertyIsNull': 'isNull',
   //'ogc:PropertyIsBetween'
   // ogc:PropertyIsLike
};

// namespaces for Tag lookup in XML
var namespaceMapping = {
   se: 'http://www.opengis.net/se',
   ogc: 'http://www.opengis.net/ogc'
};

function getTagNameArray(element, tagName) {
   var tagParts = tagName.split(':');
   var ns = null;
   if (tagParts.length == 2) {
      ns = tagParts[0];
      tagName = tagParts[1];
   }
   return [].slice.call(element.getElementsByTagNameNS(namespaceMapping[ns], tagName));
};

/**
 * SLD Styler. Reads SLD 1.1.0.
 *
 */
L.SLDStyler = L.Class.extend({
   // none yet
   options: {
      unmatchedStyle : voidStyle,
      defaultStyle: defaultStyle
   },
   initialize: function(sldStringOrXml, options) {
      L.Util.setOptions(this, options);
      if (sldStringOrXml !== undefined) {
         this.featureTypeStyles = this.parse(sldStringOrXml);
      }
   },

   // translates PolygonSymbolizer attributes into Path attributes
   parseSymbolizer: function(symbolizer) {
      // SvgParameter names below se:Fill and se:Stroke
      // are unique so don't bother parsing them seperatly.
      var parameters = getTagNameArray(symbolizer, 'se:SvgParameter');
      var cssParams = L.extend({}, this.options.defaultStyle);
      parameters.forEach(function(param) {
         var key = param.getAttribute('name');
         var mappedKey = attributeNameMapping[key];
         if (false == (mappedKey in cssParams)) {
            console.error("Ignorning unknown SvgParameter name", key);
         } else {
            var value = param.textContent;
            if (numericAttributes.indexOf(mappedKey) > -1) {
               value = parseFloat(value, 10);
            } else if (mappedKey === 'dashArray') {
               value = value.split(' ').join(', ');
            }
            cssParams[mappedKey] = value;
         }
      });
      return cssParams;
   },

   parseFilter: function(filter) {
      var hasAnd = getTagNameArray(filter, 'ogc:And').length;
      var hasOr = getTagNameArray(filter, 'ogc:Or').length;
      var filterJson = {
         operator: hasAnd == true ? 'and' : hasOr ?  'or' : null,
         comparisions: []
      };
      Object.keys(comparisionOperatorMapping).forEach(function(key) {
         var comparisionElements = getTagNameArray(filter, key);
         var comparisionOperator = comparisionOperatorMapping[key];
         comparisionElements.forEach(function(comparisionElement) {
            var property = getTagNameArray(comparisionElement, 'ogc:PropertyName')[0].textContent;
            var literal = getTagNameArray(comparisionElement, 'ogc:Literal')[0].textContent;
            filterJson.comparisions.push({
               operator: comparisionOperator,
               property: property,
               literal: literal
            })
         })
      });
      return filterJson;
   },

   parseRule: function(rule) {
      var filter = getTagNameArray(rule, 'ogc:Filter')[0];
      var polygonSymbolizer = getTagNameArray(rule, 'se:PolygonSymbolizer')[0];
      var lineSymbolizer = getTagNameArray(rule, 'se:LineSymbolizer')[0];
      var pointSymbolizer = getTagNameArray(rule, 'se:PointSymbolizer')[0];
 
      var objRet = new Object();
      if (filter) objRet.filter = this.parseFilter(filter);
      if (polygonSymbolizer) objRet.polygonSymbolizer = this.parseSymbolizer(polygonSymbolizer);
      if (lineSymbolizer) objRet.lineSymbolizer = this.parseSymbolizer(lineSymbolizer);
      if (pointSymbolizer) objRet.pointSymbolizer = this.parseSymbolizer(pointSymbolizer);

      return objRet;
   },

   parse: function(sldStringOrXml) {
      var xmlDoc = sldStringOrXml;
      if (typeof(sldStringOrXml) === 'string') {
         var parser = new DOMParser();
         xmlDoc = parser.parseFromString(sldStringOrXml, "text/xml");
      }
      var featureTypeStyles = getTagNameArray(xmlDoc, 'se:FeatureTypeStyle');
      window.xmlDoc = xmlDoc;
      return featureTypeStyles.map(function(featureTypeStyle) {
         var rules = getTagNameArray(featureTypeStyle, 'se:Rule');
         return rules.map(function(rule) {
            return this.parseRule(rule);
         }, this);
      }, this);
   },

   isFilterMatch: function(filter, properties) {
      var operator = filter.operator == null || filter.operator == 'and' ? 'every' : 'some';
      return filter.comparisions[operator](function(comp) {
         if (comp.operator == '==') {
            return properties[comp.property] == comp.literal;
         } else if (comp.operator == '!=') {
            return properties[comp.property] != comp.literal;
         } else if (comp.operator == '<') {
            return properties[comp.property] < comp.literal;
         } else if (comp.operator == '>') {
            return properties[comp.property] > comp.literal;
         } else if (comp.operator == '<=') {
            return properties[comp.property] <= comp.literal;
         } else if (comp.operator == '>=') {
            return properties[comp.property] >= comp.literal;
         } else {
            console.error('Unknown comparision operator', comp.operator);
         }
      });
   },
   styleFn: function(feature) {
      var matchingRule = null;
      this.featureTypeStyles.some(function(featureTypeStyle) {
         return featureTypeStyle.some(function(rule) {
            if (this.isFilterMatch(rule.filter, feature.properties)) {
               matchingRule = rule;
               return true;
            }
         }, this);
      }, this);
      if (matchingRule != null) {
         // Select symbolizer by geometry type
         switch (feature.geometry.type) {
            case 'LineString':
            case 'MultiLineString':
               return matchingRule.lineSymbolizer;
               break;
            case 'Polygon':
            case 'MultiPolygon':
               return matchingRule.polygonSymbolizer;
               break;
            case 'Point':
               return matchingRule.pointSymbolizer;
               break;
         }
      }
      return this.options.unmatchedStyle;
   },
   getStyleFunction: function() {
      return this.styleFn.bind(this);
   }
});

//L.SLDStyler.defaultStyle = defaultStyle;

})();