import { ClusterMap, XOR } from "./types";
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
  private _store = new Map<
    number,
    { map: ClusterMap<T>; arrY: Float64Array }
  >();

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

    const map = new Map<number, [x: number, index: number]>();

    const pointsLength = points.length;

    const yAxis = new Float64Array(pointsLength);
    const xAxis = new Float64Array(pointsLength);
    const ids = new Int32Array(pointsLength);

    // this._initCluster(arr, map, points);

    const { getLatLng } = this._options;

    const f1 = (i: number) => {
      const coords = getLatLng(points[i]);

      let y = latToY(coords[0]);

      if (map.has(y)) {
        y += Number.EPSILON;
      }

      map.set(y, [lngToX(coords[1]), i]);
      yAxis[i] = y;
    };

    for (let i = pointsLength; i--; ) {
      f1(i);
    }

    yAxis.sort();

    const f2 = (i: number) => {
      const id = map.get(yAxis[i])!;

      xAxis[i] = id[0];

      ids[i] = id[1];
    };

    for (let i = pointsLength; i--; ) {
      f2(i);
    }

    const data = [yAxis, xAxis, ids];

    const fn3 = (z: number) => {
      const r = pixelsToDistance(radius, extent, z);
      const r2 = r * 2;
      const l = data.length - 1;
      const prevIds = data[l];
      const prevXAxis = data[l - 1];
      const prevYAxis = data[l - 2];

      const pointsLength = prevYAxis.length;

      const _yAxis = [];
      const _xAxis = new Float64Array(pointsLength);
      const unsortIds = new Float64Array(pointsLength);

      let startIndex = 0;

      const clusters = new Map<
        number,
        [y: number, x: number, count: number, index: number]
      >();

      for (let i = 0; i < pointsLength; i++) {
        const y = prevYAxis[i];
        const x = prevXAxis[i];

        while (y > _yAxis[startIndex] + r2) {
          startIndex++;
        }

        let clustered = false;

        for (let j = startIndex; j < _yAxis.length; j++) {
          const kek = _xAxis[j];
          if (x >= kek - r && x <= kek + r) {
            const bek = _yAxis[j];
            if (clusters.has(bek)) {
              const v = clusters.get(bek)!;
              v[0] += y;
              v[1] += x;
              v[2]++;
            } else {
              clusters.set(bek, [y + _yAxis[j], x + kek, 2, j]);
            }

            clustered = true;

            break;
          }
        }

        if (!clustered) {
          const endIndex = _yAxis.push(y);
          _xAxis[endIndex] = x;
          unsortIds[endIndex] = prevIds[i];
        }
      }

      const yAxis = new Float64Array(_yAxis);

      const iterator = clusters.values();

      for (let i = clusters.size; i--; ) {
        const v: [y: number, x: number, count: number, index: number] =
          iterator.next().value;

        const count = v[2];

        let y = v[0] / count;

        if (map.get(y)) {
          y += Number.EPSILON;
        }

        map.set(y, [v[1] / count, -count]);

        yAxis[v[3]] = y;
      }

      yAxis.sort();

      const ll = yAxis.length;

      const xAxis = new Float64Array(ll);
      const ids = new Int32Array(ll);

      for (let i = ll; i--; ) {
        const v = map.get(yAxis[i])!;
        xAxis[i] = v[0];
        ids[i] = v[1];
      }

      data.push(yAxis, xAxis, ids);
    };

    for (let z = maxZoom; z > minZoom; z--) {
      fn3(z);
    }

    console.log(performance.now() - t1);

    console.log(data);

    // this._store = getStore(
    //   map,
    //   new Float64Array(arr).sort().buffer,
    //   minZoom,
    //   maxZoom,
    //   radius,
    //   extent
    // );
  }

  getPoints = ((
    zoom: number,
    westLng: number,
    southLat: number,
    eastLng: number,
    northLat: number,
    arg1: (<M>(marker: Marker<T>) => M) | number | undefined,
    arg2,
    arg3
  ) => {
    const points: ReturnType<GetPoints<T>> = [];

    let mutate: (p: Point<T>) => any;

    let expand: number;

    if (typeof arg1 == "function") {
      mutate = (p) => points.push(p.items ? arg2(p) : arg1(p));

      expand = arg3 || 0;
    } else {
      mutate = points.push;

      expand = arg1 || 0;
    }

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
        this._mutatePoints(mutate, 0, minY, maxX, maxY, zoom);
        this._mutatePoints(mutate, minX, minY, 1, maxY, zoom);

        return points;
      }
    } else {
      minX = 0;
      maxX = 1;
    }

    this._mutatePoints(mutate, minX, minY, maxX, maxY, zoom);

    return points;
  }) as GetPoints<T>;

  private _mutatePoints(
    mutate: (p: Point<T>) => any,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    zoom: number
  ) {
    const { minZoom, maxZoom } = this._options;

    const { map, arrY } = this._store.get(clamp(minZoom, zoom, maxZoom + 1))!;

    let start = 0;
    let end = arrY.length - 1;

    while (arrY[start] < minY) {
      const middle = Math.floor((start + end) / 2);

      if (minY < arrY[middle]) {
        end = middle - 1;
      } else {
        start = middle + 1;
      }
    }

    end = arrY.length - 1;

    const first = start;

    while (arrY[end] > maxY) {
      const middle = Math.floor((start + end) / 2);

      if (maxY < arrY[middle]) {
        end = middle - 1;
      } else {
        start = middle + 1;
      }
    }

    end++;

    for (let i = first; i < end; i++) {
      const aX = map.get(arrY[i])!;
      for (let j = 0; j < aX.length; j += 2) {
        const curr = aX[j];
        if (curr > minX && curr < maxX) {
          mutate(aX[j + 1] as Point<T>);
        }
      }
    }
  }
}

export default MarkerCluster;
