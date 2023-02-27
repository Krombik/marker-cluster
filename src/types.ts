export type Data = [
  xArr: Float64Array,
  yArr: Float64Array,
  clustersZoom: Uint8Array,
  clustersCount: UintArray,
  clustersFlat: UintArray,
  clustersFlatNav: UintArray,
  zoomSplitter: Int8Array,
  indexes: UintArray
];

export type UintArray = Uint8Array | Uint16Array | Uint32Array;

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
   * size of the tile grid used for clustering
   * @default 256
   */
  extent?: number;
  /**
   * method to be called once the loading operation has finished executing
   */
  callback?(): void;
};

export type MarkerMapper<T, M> = (point: T, uniqueKey: number) => M;

export type ClusterMapper<C> = (
  lng: number,
  lat: number,
  count: number,
  expandZoom: number,
  uniqueKey: number,
  clusterId: number
) => C;
