import { ClusterMap, PointsData, XOR } from "./types";
import {
  getStore,
  clamp,
  pixelsToDistance,
  addDot,
  pair,
  boundedLatToY,
  boundedLngToX,
  latToY,
  lngToX,
  yToLat,
  xToLng,
} from "./utils";

type Coords = [lat: number, lng: number];

export type Marker<T> = { marker: T; coords: Coords; key: number };

export type Cluster<T> = {
  items: Point<T>[];
  key: number;
  zoom: number;
  count: number;
  coords: Coords;
};

export type Point<T> = XOR<[Cluster<T>, Marker<T>]>;

type Keksaw<T> = (T | Keksaw<T>)[];

export type ClustererOptions<T> = {
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

export type GetClustersArg = [
  zoom: number,
  westLng: number,
  southLat: number,
  eastLng: number,
  northLat: number
];

type GetPoints<T> = {
  /**
   * @param expand
   * @default 0
   */
  (
    zoom: number,
    westLng: number,
    southLat: number,
    eastLng: number,
    northLat: number,
    expand?: number
  ): Point<T>[];
  /**
   * @param expand
   * @default 0
   */
  <M, C>(
    zoom: number,
    westLng: number,
    southLat: number,
    eastLng: number,
    northLat: number,
    getMarker: (marker: Marker<T>) => M,
    getCluster: (cluster: Cluster<T>) => C,
    expand?: number
  ): (M | C)[];
};

class MarkerCluster<T> {
  private _options: Required<ClustererOptions<T>>;
  private _store = new Map<number, PointsData>();

  points: T[];
  _clusters: Int32Array;

  zoomSplitter: Int8Array;
  clusterEndIndexes: Int32Array;

  constructor(options: ClustererOptions<T>) {
    this._options = {
      minZoom: 0,
      maxZoom: 16,
      radius: 60,
      extent: 256,
      ...options,
    };
  }

  private _initCluster(arrY: number[], map: ClusterMap<T>, points: T[]) {
    const { getLatLng } = this._options;

    for (let i = points.length; i--; ) {
      const p = points[i];

      const coords = getLatLng(p);

      const y = latToY(coords[0]);
      const x = lngToX(coords[1]);

      addDot(map, arrY, y, x, {
        marker: p,
        coords,
        key: pair(x, y),
      });
    }
  }

  async loadAsync(points: T[], onLoad: () => void) {
    let t1 = performance.now();
    const worker = new Worker(new URL("./worker.js", import.meta.url), {
      type: "module",
    });

    console.log(performance.now() - t1);

    t1 = performance.now();
    const { minZoom, maxZoom, extent, radius } = this._options;

    const map: ClusterMap<T> = new Map();

    const arr: number[] = [];

    this._initCluster(arr, map, points);
    console.log(performance.now() - t1);
    t1 = performance.now();
    worker.addEventListener("message", (e) => {
      this._store = e.data;
      console.log(performance.now() - t1);
      onLoad();
      // console.log(kek);
    });
    const bek = new Float64Array(arr).sort().buffer;
    worker.postMessage({ map, arr: bek, minZoom, maxZoom, extent, radius }, [
      bek,
    ]);
  }

  load(points: T[]) {
    const { minZoom, maxZoom, extent, radius } = this._options;

    const t1 = performance.now();

    const map = new Map<number, [index: number, x: number]>();

    const pointsLength = points.length;

    const yAxis = new Float64Array(pointsLength);
    const xAxis = new Float64Array(pointsLength);
    const ids = new Int32Array(pointsLength);

    const { getLatLng } = this._options;

    const f1 = (i: number) => {
      const coords = getLatLng(points[i]);

      let y = latToY(coords[0]);

      while (map.has(y)) {
        y += Number.EPSILON;
      }

      map.set(y, [i, lngToX(coords[1])]);
      yAxis[i] = y;
    };

    for (let i = pointsLength; i--; ) {
      f1(i);
    }

    yAxis.sort();

    const f2 = (i: number) => {
      const v = map.get(yAxis[i])!;

      ids[i] = v[0];

      xAxis[i] = v[1];
    };

    for (let i = pointsLength; i--; ) {
      f2(i);
    }

    const data: PointsData = [yAxis, xAxis, ids];

    const zoomSplitter: number[] = [];

    const clusters: number[] = [];

    const clusterEndIndexes: number[] = [];

    const fn3 = (z: number) => {
      const r = pixelsToDistance(radius, extent, z);
      const r2 = r * 2;

      const l = data.length - 1;

      const prevIds = data[l];
      const prevXAxis = data[l - 1];
      const prevYAxis = data[l - 2];

      const pointsLength = prevYAxis.length;

      const _yAxis: number[] = [];
      const _xAxis: number[] = [];

      let startIndex = 0;

      type ClusterTuple = [
        y: number,
        x: number,
        items: number[],
        index: number
      ];

      const clustersMap = new Map<number, ClusterTuple>();

      const fn1 = (i: number) => {
        const y = prevYAxis[i];
        const x = prevXAxis[i];

        while (y > _yAxis[startIndex] + r2) {
          startIndex++;
        }

        const fn1 = (j: number) => {
          const _x = _xAxis[j];

          if (x >= _x - r && x <= _x + r) {
            const _y = _yAxis[j];

            const id = prevIds[i];

            if (clustersMap.has(_y)) {
              const v = clustersMap.get(_y)!;

              v[0] += y;
              v[1] += x;
              v[2].push(id);
            } else {
              clustersMap.set(_y, [_y + y, _x + x, [map.get(_y)![0], id], j]);
            }

            return true;
          }

          return false;
        };

        const fn2 = () => {
          const l = _yAxis.length;

          for (let j = startIndex; j < l; j++) {
            if (fn1(j)) return false;
          }

          return true;
        };

        if (fn2()) {
          _yAxis.push(y);
          _xAxis.push(x);
        }
      };

      for (let i = 0; i < pointsLength; i++) {
        fn1(i);
      }

      if (clustersMap.size) {
        const yAxis = new Float64Array(_yAxis);

        const iterator = clustersMap.values();

        const fn1 = () => {
          const v: ClusterTuple = iterator.next().value;

          const items = v[2];

          const count = items.length;

          let y = v[0] / count;

          while (map.has(y)) {
            y += Number.EPSILON;
          }

          map.set(y, [-clusters.push(count), v[1] / count]);

          let allCount = 0;

          for (let i = count; i--; ) {
            const id = items[i];

            allCount += id < 0 ? clusters[-id] : 1;
          }

          clusters.push(allCount, ...items);

          yAxis[v[3]] = y;
        };

        for (let i = clustersMap.size; i--; ) {
          fn1();
        }

        yAxis.sort();

        const l = yAxis.length;

        const xAxis = new Float64Array(l);
        const ids = new Int32Array(l);

        const fn2 = (i: number) => {
          const v = map.get(yAxis[i])!;

          ids[i] = v[0];

          xAxis[i] = v[1];
        };

        for (let i = l; i--; ) {
          fn2(i);
        }

        data.push(yAxis, xAxis, ids);
        zoomSplitter.push(z);
        clusterEndIndexes.push(clusters.length);
      }
    };

    for (let z = maxZoom; z >= minZoom; z--) {
      fn3(z);
    }

    const store = new Map<number, PointsData>();

    const _t = [maxZoom + 1, ...zoomSplitter, minZoom - 1];

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

    this.clusterEndIndexes = new Int32Array(clusterEndIndexes);

    this.zoomSplitter = new Int8Array(zoomSplitter);

    this.points = points;

    this._store = store;

    this._clusters = new Int32Array(clusters);

    console.log(performance.now() - t1);

    // this._store = getStore(
    //   map,
    //   new Float64Array(arr).sort().buffer,
    //   minZoom,
    //   maxZoom,
    //   radius,
    //   extent
    // );
  }

  getZoom(clusterId: number) {
    clusterId = -clusterId;

    const clusterEndIndexes = this.clusterEndIndexes;

    for (let i = clusterEndIndexes.length; i--; ) {
      if (clusterEndIndexes[i] < clusterId) return this.zoomSplitter[i];
    }

    return -1;
  }

  getChildren(clusterId: number) {
    return this._mapChildrenIds(this._getChildrenIds(clusterId));
  }

  private _mapChildrenIds(items: number[]): Keksaw<T> {
    const acc: Keksaw<T> = [];

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
    getMarker: (point: T, lat: number, lng: number) => M,
    getCluster: (count: number, id: number, lat: number, lng: number) => C,
    expand?: number
  ) {
    const value: (M | C)[] = [];

    const { minZoom, maxZoom } = this._options;

    const [yAxis, xAxis, ids] = this._store.get(
      clamp(minZoom, zoom, maxZoom + 1)
    )!;

    const clusters = this._clusters;

    const points = this.points;

    const mutate = (index: number) => {
      const y = yAxis[index];
      const x = xAxis[index];
      const id = ids[index];

      value.push(
        id < 0
          ? getCluster(clusters[-id], id, yToLat(y), xToLng(x))
          : getMarker(points[id], yToLat(y), xToLng(x))
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
