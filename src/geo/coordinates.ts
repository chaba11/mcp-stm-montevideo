// Re-export UTM converter for use in geo module
// Coordinates in STM shapefiles are EPSG:32721 (WGS 84 / UTM zone 21S)
export { utm21SToWgs84 } from "../data/utm-converter.js";
