export type Data = [PointsData, Int8Array, Int32Array, Int32Array];

export type PointsData = [
  yAxis: Float64Array,
  xAxis: Float64Array,
  ids: Int32Array
];

export type ChildCluster = { clusterId: number; count: number };

export type Coords = [lng: number, lat: number];

export type MarkerClusterOptions = {
  /**
   * min zoom level to cluster the points on
   * @default 0
   */
  minZoom?: number;
  /**
   * max zoom level to cluster the points on
   * @default 16
   */
  maxZoom?: number;
  /**
   * cluster radius in pixels
   * @default 60
   */
  radius?: number;
  /**
   * tile extent (radius is calculated relative to it)
   * @default 256
   */
  extent?: number;
};

export type MarkerMapper<T, M> = (point: T, lng: number, lat: number) => M;

export type ClusterMapper<C> = (
  lng: number,
  lat: number,
  count: number,
  clusterId: number
) => C;
