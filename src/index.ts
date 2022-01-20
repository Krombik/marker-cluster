import { Data, NestedArray, PointsData } from "./types";
import {
  clamp,
  pixelsToDistance,
  boundedLatToY,
  boundedLngToX,
  latToY,
  lngToX,
  yToLat,
  xToLng,
  getData,
} from "./utils";

export type Coords = [lng: number, lat: number];

export type MarkerClusterOptions<T> = {
  /**
   * Min zoom level to cluster the points on
   * @default 0
   */
  minZoom?: number;
  /**
   * Max zoom level to cluster the points on
   * @default 16
   */
  maxZoom?: number;
  /**
   * Cluster radius in pixels
   * @default 60
   */
  radius?: number;
  /**
   * tile extent (radius is calculated relative to it)
   * @default 256
   */
  extent?: number;
  getLatLng: (item: T) => Coords;
};

class MarkerCluster<T> {
  points: T[];

  private _options: Required<MarkerClusterOptions<T>>;
  private _store = new Map<number, PointsData>();
  private _clusters: Int32Array;
  private _zoomSplitter: Int8Array;
  private _clusterEndIndexes: Int32Array;
  private _yOrigin: Float64Array;

  constructor(options: MarkerClusterOptions<T>) {
    this._options = {
      minZoom: 0,
      maxZoom: 16,
      radius: 60,
      extent: 256,
      ...options,
    };
  }

  async loadAsync(points: T[], onLoad: () => void) {
    let t1 = performance.now();

    const worker = new Worker(new URL("./worker.js", import.meta.url), {
      type: "module",
    });

    const { minZoom, maxZoom, extent, radius } = this._options;

    const [yOrigin, xOrigin] = this._getOriginAxis(points);

    worker.addEventListener("message", (e) => {
      this._setStore(e.data, points, yOrigin, minZoom, maxZoom);

      onLoad();

      console.log(performance.now() - t1);
    });

    const _yOrigin = new Float64Array(yOrigin);

    worker.postMessage(
      [_yOrigin, xOrigin, minZoom, maxZoom, radius, extent],
      [_yOrigin.buffer, xOrigin.buffer]
    );
  }

  private _getOriginAxis(points: T[]) {
    const { getLatLng } = this._options;

    const pointsLength = points.length;

    const yOrigin = new Float64Array(pointsLength);
    const xOrigin = new Float64Array(pointsLength);

    const f = (i: number) => {
      const coords = getLatLng(points[i]);

      xOrigin[i] = lngToX(coords[0]);
      yOrigin[i] = latToY(coords[1]);
    };

    for (let i = pointsLength; i--; ) {
      f(i);
    }

    return [yOrigin, xOrigin] as const;
  }

  load(points: T[]) {
    const t1 = performance.now();

    const { minZoom, maxZoom, radius, extent } = this._options;

    const [yOrigin, xOrigin] = this._getOriginAxis(points);

    this._setStore(
      getData(yOrigin, xOrigin, minZoom, maxZoom, radius, extent),
      points,
      yOrigin,
      minZoom,
      maxZoom
    );

    console.log(performance.now() - t1);
  }

  private _setStore(
    d: Data,
    points: T[],
    yOrigin: Float64Array,
    minZoom: number,
    maxZoom: number
  ) {
    const [data, zoomSplitter] = d;

    const store = new Map<number, PointsData>();

    const _t = [maxZoom + 1, ...Array.from(zoomSplitter), minZoom - 1];

    for (let i = 0; i < _t.length - 1; i++) {
      const index = i * 3;

      const v: PointsData = [
        data[index] as Float64Array,
        data[index + 1] as Float64Array,
        data[index + 2] as Int32Array,
      ];

      const next = _t[i + 1];

      for (let j = _t[i]; j > next; j--) {
        store.set(j, v);
      }
    }

    this._yOrigin = yOrigin;

    this._zoomSplitter = zoomSplitter;

    this.points = points;

    this._store = store;

    this._clusters = d[2];

    this._clusterEndIndexes = d[3];
  }

  getZoom(clusterId: number) {
    clusterId = -clusterId;

    const clusterEndIndexes = this._clusterEndIndexes;

    for (let i = clusterEndIndexes.length; i--; ) {
      if (clusterEndIndexes[i] < clusterId) return this._zoomSplitter[i];
    }

    return -1;
  }

  getChildren(clusterId: number) {
    return this._mapChildrenIds(this._getChildrenIds(clusterId));
  }

  private _mapChildrenIds(items: number[]): NestedArray<T> {
    const acc: NestedArray<T> = [];

    const points = this.points;

    const f1 = (i: number) => {
      const id = items[i];

      if (id < 0) {
        acc.push(this._mapChildrenIds(this._getChildrenIds(id)));
      } else {
        acc.push(points[id]);
      }
    };

    for (let i = items.length; i--; ) {
      f1(i);
    }

    return acc;
  }

  private _getChildrenIds(clusterId: number) {
    clusterId = -clusterId;

    const arr: number[] = [];

    const clusters = this._clusters;

    const l = clusterId + clusters[clusterId - 1] + 1;

    for (let j = clusterId + 1; j < l; j++) {
      arr.push(clusters[j]);
    }

    return arr;
  }

  getPoints<M, C>(
    zoom: number,
    westLng: number,
    southLat: number,
    eastLng: number,
    northLat: number,
    getMarker: (point: T, lng: number, lat: number) => M,
    getCluster: (lng: number, lat: number, count: number, id: number) => C,
    expand?: number
  ) {
    const value: (M | C)[] = [];

    const { minZoom, maxZoom } = this._options;

    const [yAxis, xAxis, ids] = this._store.get(
      clamp(minZoom, zoom, maxZoom + 1)
    )!;

    const clusters = this._clusters;

    const points = this.points;

    const yOrigin = this._yOrigin;

    const mutate = (index: number) => {
      const lng = xToLng(xAxis[index]);
      const id = ids[index];

      value.push(
        id < 0
          ? getCluster(lng, yToLat(yAxis[index]), clusters[-id], id)
          : getMarker(points[id], lng, yToLat(yOrigin[id]))
      );
    };

    let minY = boundedLatToY(northLat);
    let maxY = boundedLatToY(southLat);

    let expandX: number;

    if (expand) {
      const expandY =
        Math.abs(expand) < 1
          ? (maxY - minY) * expand
          : (expandX = pixelsToDistance(expand, this._options.extent, zoom));

      minY = clamp(0, minY - expandY, 1);
      maxY = clamp(0, maxY + expandY, 1);
    }

    let minX: number;
    let maxX: number;

    if (eastLng - westLng < 360) {
      minX = boundedLngToX(westLng);
      maxX = eastLng == 180 ? 1 : boundedLngToX(eastLng);

      if (expand) {
        expandX ||= Math.abs(maxX - minX) * expand;

        minX = clamp(0, minX - expandX, 1);
        maxX = clamp(0, maxX + expandX, 1);
      }

      if (minX > maxX) {
        this._mutatePoints(mutate, yAxis, xAxis, 0, minY, maxX, maxY);
        this._mutatePoints(mutate, yAxis, xAxis, minX, minY, 1, maxY);

        return value;
      }
    } else {
      minX = 0;
      maxX = 1;
    }

    this._mutatePoints(mutate, yAxis, xAxis, minX, minY, maxX, maxY);

    return value;
  }

  private _mutatePoints(
    mutate: (index: number) => void,
    yAxis: Float64Array,
    xAxis: Float64Array,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number
  ) {
    let start = 0;
    let end = yAxis.length - 1;

    const fn1 = () => {
      const middle = Math.floor((start + end) / 2);

      if (minY < yAxis[middle]) {
        end = middle - 1;
      } else {
        start = middle + 1;
      }
    };

    while (yAxis[start] < minY) {
      fn1();
    }

    end = yAxis.length - 1;

    const first = start;

    const fn2 = () => {
      const middle = Math.floor((start + end) / 2);

      if (maxY < yAxis[middle]) {
        end = middle - 1;
      } else {
        start = middle + 1;
      }
    };

    while (yAxis[end] > maxY) {
      fn2();
    }

    end++;

    const fn = (i: number) => {
      const x = xAxis[i];

      if (x >= minX && x <= maxX) {
        mutate(i);
      }
    };

    for (let i = first; i < end; i++) {
      fn(i);
    }
  }
}

export default MarkerCluster;
