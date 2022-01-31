import {
  ChildCluster,
  ClusterMapper,
  Coords,
  Data,
  MarkerClusterOptions,
  MarkerMapper,
  PointsData,
} from "./types";
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

export {
  MarkerClusterOptions,
  Coords,
  MarkerMapper,
  ClusterMapper,
  ChildCluster,
};

class MarkerCluster<T> {
  /** `points` from last executed {@link MarkerCluster.loadAsync loadAsync} or {@link MarkerCluster.load load} */
  points?: T[];
  /**
   * [Worker](https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker) instance, inits at first {@link MarkerCluster.loadAsync loadAsync} call
   */
  worker?: Worker;

  private readonly _options: Required<MarkerClusterOptions>;
  private readonly _getLngLat: (item: T) => Coords;

  private _objectUrl: string;
  private _store = new Map<number, PointsData>();
  private _clusters: Int32Array;
  private _zoomSplitter: Int8Array;
  private _clusterEndIndexes: Int32Array;

  constructor(getLngLat: (item: T) => Coords, options?: MarkerClusterOptions) {
    this._getLngLat = getLngLat;

    this._options = Object.freeze({
      minZoom: 0,
      maxZoom: 16,
      radius: 60,
      extent: 256,
      ...options,
    });
  }

  /**
   * loads given points
   * @param points points for clustering
   */
  load(points: T[]) {
    const { minZoom, maxZoom, radius, extent } = this._options;

    const [yOrigin, xOrigin] = this._getOriginAxis(points);

    this._setStore(
      getData(
        pixelsToDistance,
        yOrigin,
        xOrigin,
        minZoom,
        maxZoom,
        radius,
        extent
      ),
      points,
      minZoom
    );
  }

  /**
   * same to {@link MarkerCluster.load load}, but do clustering at another thread
   * @see {@link MarkerCluster.cleanUp cleanUp}
   * @description this method use [Worker](https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker)
   */
  async loadAsync(points: T[]) {
    this.worker ||= new Worker(
      this._objectUrl ||
        (this._objectUrl = URL.createObjectURL(
          new Blob(
            [
              `self.onmessage=function(e){for(var f=e.data,s=(${getData.toString()})(${pixelsToDistance.toString()},f[0],f[1],f[2],f[3],f[4],f[5]),a=[],t=s[0],r=0;r<t.length;r++)a.push(t[r].buffer);a.push(s[1].buffer,s[2].buffer,s[3].buffer),self.postMessage(s,a)};`,
            ],
            { type: "application/javascript" }
          )
        ))
    );

    this.worker.onmessage;

    const { minZoom, maxZoom, extent, radius } = this._options;

    const [yOrigin, xOrigin] = this._getOriginAxis(points);

    let resolve: () => void;

    const promise = new Promise<void>((_resolve) => {
      resolve = _resolve;
    });

    this.worker.addEventListener("message", (e) => {
      this._setStore(e.data, points, minZoom);

      resolve();
    });

    this.worker.postMessage(
      [yOrigin, xOrigin, minZoom, maxZoom, radius, extent],
      [yOrigin.buffer, xOrigin.buffer]
    );

    return promise;
  }

  /**
   * if {@link MarkerCluster.loadAsync loadAsync} was called, use this method before {@link MarkerCluster MarkerCluster} instance has gone
   */
  cleanUp() {
    this.worker?.terminate();

    if (this._objectUrl) URL.revokeObjectURL(this._objectUrl);
  }

  /**
   * @param expand for values in range (0..1) considered as percentage, otherwise as absolute pixels value to expand given `boundary`.
   * @returns array of clusters and points for the given `zoom` and `boundary`
   */
  getPoints<M, C>(
    zoom: number,
    westLng: number,
    southLat: number,
    eastLng: number,
    northLat: number,
    markerMapper: MarkerMapper<T, M>,
    clusterMapper: ClusterMapper<C>,
    expand?: number
  ) {
    const points = this.points;

    const value: (M | C)[] = [];

    if (points) {
      const { minZoom, maxZoom } = this._options;

      const [yAxis, xAxis, ids] = this._store.get(
        clamp(minZoom, zoom, maxZoom + 1)
      )!;

      const clusters = this._clusters;

      const mutate = (index: number) => {
        const lng = xToLng(xAxis[index]);
        const lat = yToLat(yAxis[index]);
        const id = ids[index];

        value.push(
          id < 0
            ? clusterMapper(lng, lat, clusters[-id], id)
            : markerMapper(points[id], lng, lat)
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
    }

    return value;
  }

  /**
   * @returns zoom level on which the cluster splits into several children, or `-1` if it cluster of several points with same coords
   */
  getZoom(clusterId: number) {
    clusterId = -clusterId;

    const clusterEndIndexes = this._clusterEndIndexes;

    for (let i = clusterEndIndexes.length; i--; ) {
      if (clusterEndIndexes[i] < clusterId) return this._zoomSplitter[i];
    }

    return -1;
  }

  /**
   * @returns array with children of cluster
   */
  getChildren(clusterId: number) {
    const points = this.points;

    const children: (T | ChildCluster)[] = [];

    if (points) {
      const childrenIds = this._getChildrenIds(clusterId);

      const clusters = this._clusters;

      const f1 = (id: number) => {
        children.push(
          id < 0 ? { clusterId: id, count: clusters[-id] } : points[id]
        );
      };

      for (let i = childrenIds.length; i--; ) {
        f1(childrenIds[i]);
      }
    }

    return children;
  }

  private _getOriginAxis(points: T[]) {
    const getLngLat = this._getLngLat;

    const pointsLength = points.length;

    const yOrigin = new Float64Array(pointsLength);
    const xOrigin = new Float64Array(pointsLength);

    const f = (i: number) => {
      const coords = getLngLat(points[i]);

      xOrigin[i] = lngToX(coords[0]);
      yOrigin[i] = latToY(coords[1]);
    };

    for (let i = pointsLength; i--; ) {
      f(i);
    }

    return [yOrigin, xOrigin] as const;
  }

  private _setStore(d: Data, points: T[], minZoom: number) {
    const [data, zoomSplitter] = d;

    const store = new Map<number, PointsData>();

    const _t = [...Array.from(zoomSplitter), minZoom - 1];

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

    this._zoomSplitter = zoomSplitter;

    this.points = points;

    this._store = store;

    this._clusters = d[2];

    this._clusterEndIndexes = d[3];
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
