import {
  ClusterMapper,
  Coords,
  Data,
  MarkerClusterOptions,
  MarkerMapper,
  UintArray,
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
  getMaxPossibleCount,
  getTypedArray,
  noop,
} from "./utils";

export type { MarkerClusterOptions, Coords, MarkerMapper, ClusterMapper };

class MarkerCluster<T> {
  /** The points from the last executed {@link MarkerCluster.loadAsync loadAsync} or {@link MarkerCluster.load load} method */
  points?: T[];
  /** Indicates whether a loading operation is currently in progress */
  isLoading = false;
  /** method from {@link MarkerClusterOptions.callback options}, you can use it to update ui after calling {@link MarkerCluster.setZoom setZoom} and/or {@link MarkerCluster.setBounds setBounds}  */
  callback: () => void;
  /**
   * [Worker](https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker) instance, inits at first {@link MarkerCluster.loadAsync loadAsync} call
   */
  static worker?: Worker;

  /**
   * If {@link MarkerCluster.loadAsync loadAsync} was called, use this method to abandon {@link MarkerCluster.worker worker} if it needed
   */
  static cleanup = noop;

  /**
   * @param getLngLat - function to get the latitude and longitude coordinates of a marker
   * @param options - options for configuring the clustering
   */
  constructor(
    getLngLat: (item: T) => Coords,
    options: MarkerClusterOptions = {}
  ) {
    this._getLngLat = getLngLat;
    this._minZoom = options.minZoom || 0;
    this._maxZoom = (options.maxZoom as any) >= 0 ? options.maxZoom! : 16;
    this._radius = options.radius || 60;
    this._extent = options.extent || 256;
    this.callback = options.callback || noop;
  }

  /**
   * Loads the given points and clusters them for each zoom level from {@link MarkerClusterOptions.maxZoom maxZoom} to {@link MarkerClusterOptions.minZoom minZoom}
   * @param points - The points to be clustered
   */
  load = (points: T[]) => {
    this.isLoading = true;

    const dataMap = new Map<number, number>();

    const args: any[] = this._getDataArgs(
      points,
      dataMap.has.bind(dataMap),
      dataMap.set.bind(dataMap)
    );

    args.push(dataMap, pixelsToDistance, getTypedArray);

    this._setStore(points, getData.apply(null, args));

    this.isLoading = false;

    this.callback();

    return this;
  };

  /**
   * Loads the given points and asynchronously clusters them for each zoom level from {@link MarkerClusterOptions.maxZoom maxZoom} to {@link MarkerClusterOptions.minZoom minZoom}
   * @see {@link MarkerCluster.cleanup cleanup}
   * @description this method use [Worker](https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker) and fallbacks to {@link MarkerCluster.load load} if {@link MarkerCluster.worker worker} initializing was failed
   */
  loadAsync = (points: T[]) =>
    new Promise<this>((resolve) => {
      this.isLoading = true;

      let worker: Worker;

      try {
        worker = MarkerCluster._getWorker();
      } catch (err) {
        return resolve(this.load(points));
      }

      const dataSet = new Set<number>();

      const args: any[] = this._getDataArgs(
        points,
        dataSet.has.bind(dataSet),
        dataSet.add.bind(dataSet)
      );

      const id = "randomUUID" in crypto ? crypto.randomUUID() : Math.random();

      const listener = (e: MessageEvent) => {
        const data = e.data;

        if (data.pop() == id) {
          worker.removeEventListener("message", listener);

          this._setStore(points, data);

          this.isLoading = false;

          this.callback();

          resolve(this);
        }
      };

      worker.addEventListener("message", listener);

      args.push(id);

      worker.postMessage(args, [
        args[0].buffer,
        args[1].buffer,
        args[2].buffer,
      ]);
    });

  /**
   * Sets current zoom level for {@link MarkerCluster.getPoints getPoints} method
   */
  setZoom = (zoom: number) => {
    this._zoom = zoom;

    return this;
  };

  /**
   * Sets current bounds for {@link MarkerCluster.getPoints getPoints} method
   * @param westLng - west longitude boundary
   * @param southLat - south latitude boundary
   * @param eastLng - east longitude boundary
   * @param northLat - north latitude boundary
   */
  setBounds = (
    westLng: number,
    southLat: number,
    eastLng: number,
    northLat: number
  ) => {
    this._bounds = [westLng, southLat, eastLng, northLat];

    return this;
  };

  /**
   * @param expand - for values in range `(0..1)` considered as percentage, otherwise as absolute pixels value to expand given {@link MarkerCluster.setBounds bounds}
   * @returns array of mapped clusters and points for the given {@link MarkerCluster.setZoom zoom} and {@link MarkerCluster.setBounds bounds}
   */
  getPoints = <M, C>(
    markerMapper: MarkerMapper<T, M>,
    clusterMapper: ClusterMapper<C>,
    expand?: number
  ) => {
    const points = this.points;

    const zoom = this._zoom;

    const bounds = this._bounds;

    const value: (M | C)[] = [];

    if (points && bounds && zoom >= 0) {
      const ids = this._store.get(
        clamp(this._minZoom, Math.round(zoom), this._maxZoom + 1)
      )!;

      let minX = bounds[0];
      let maxY = boundedLatToY(bounds[1]);
      let maxX = bounds[2];
      let minY = boundedLatToY(bounds[3]);

      const mutate = this._getPointsMutator(
        markerMapper,
        clusterMapper,
        value.push.bind(value)
      );

      let expandX: number;

      if (expand) {
        const expandY =
          Math.abs(expand) < 1
            ? (maxY - minY) * expand
            : (expandX = pixelsToDistance(expand, this._extent, zoom));

        minY = clamp(0, minY - expandY, 1);
        maxY = clamp(0, maxY + expandY, 1);
      }

      if (maxX - minX < 360) {
        minX = boundedLngToX(minX);
        maxX = maxX == 180 ? 1 : boundedLngToX(maxX);

        if (minX >= maxX) {
          this._mutatePoints(mutate, ids, 0, minY, maxX, maxY);
          this._mutatePoints(mutate, ids, minX, minY, 1, maxY);

          return value;
        }

        if (expand) {
          expandX ||= Math.abs(maxX - minX) * expand;

          minX = clamp(0, minX - expandX, 1);
          maxX = clamp(0, maxX + expandX, 1);
        }
      } else {
        minX = 0;
        maxX = 1;
      }

      this._mutatePoints(mutate, ids, minX, minY, maxX, maxY);
    }

    return value;
  };

  /**
   * @returns array with mapped children of cluster
   */
  getChildren = <M, C>(
    clusterId: number,
    markerMapper: MarkerMapper<T, M>,
    clusterMapper: ClusterMapper<C>
  ) => {
    const points = this.points;

    const children: (M | C)[] = [];

    if (points) {
      const mutate = this._getPointsMutator(
        markerMapper,
        clusterMapper,
        children.push.bind(children)
      );

      const end = this._clustersFlatNav[clusterId + 1];

      const clustersFlat = this._clustersFlat;

      for (let i = this._clustersFlatNav[clusterId]; i < end; i++) {
        mutate(clustersFlat[i]);
      }
    }

    return children;
  };

  private readonly _getLngLat: (item: T) => Coords;
  private readonly _minZoom: number;
  private readonly _maxZoom: number;
  private readonly _radius: number;
  private readonly _extent: number;

  private _store = new Map<number, UintArray>();

  private _xArr: Float64Array;
  private _yArr: Float64Array;
  private _clustersZoom: Uint8Array;
  private _clustersCount: UintArray;
  private _clustersFlat: UintArray;
  private _clustersFlatNav: UintArray;

  private _zoom = -1;
  private _bounds?: [
    westLng: number,
    southLat: number,
    eastLng: number,
    northLat: number
  ];

  private static _getWorker() {
    if (!MarkerCluster.worker) {
      const objectUrl = URL.createObjectURL(
        new Blob(
          [
            `o=${getData.toString()};p=${pixelsToDistance.toString()};l=${getTypedArray.toString()};self.onmessage=function(n){for(var e=n.data,a=e.pop(),f=new Map,s=e[0],t=s.length,u=0;u<t;u++)f.set(s[u],u);e.push(f,p,l);var r=o.apply(null,e),c=r.map(function(n){return n.buffer});r.push(a),self.postMessage(r,c)}`,
          ],
          { type: "application/javascript" }
        )
      );

      const worker = new Worker(objectUrl);

      MarkerCluster.worker = worker;

      MarkerCluster.cleanup = function () {
        MarkerCluster.cleanup = noop;

        worker.terminate();

        URL.revokeObjectURL(objectUrl);

        MarkerCluster.worker = undefined;
      };
    }

    return MarkerCluster.worker;
  }

  private _getDataArgs(
    points: T[],
    has: (Map<number, number> | Set<number>)["has"],
    add: Map<number, number>["set"] | Set<number>["add"]
  ) {
    const maxZoom = this._maxZoom;
    const minZoom = this._minZoom;

    const getLngLat = this._getLngLat;

    const pointsCount = points.length;

    const xAxis = new Float64Array(pointsCount);

    const maxPossibleCount = getMaxPossibleCount(pointsCount, maxZoom, minZoom);

    const xArr = new Float64Array(maxPossibleCount);

    const yArr = new Float64Array(maxPossibleCount);

    for (let i = 0; i < pointsCount; i++) {
      const coords = getLngLat(points[i]);

      let x = lngToX(coords[0]);

      while (has(x)) {
        x += Number.EPSILON;
      }

      add(x, i);

      xArr[i] = x;

      xAxis[i] = x;

      yArr[i] = latToY(coords[1]);
    }

    return [xAxis, xArr, yArr, minZoom, maxZoom, this._radius, this._extent];
  }

  private _setStore(points: T[], data: Data) {
    this.points = points;

    this._xArr = data[0];
    this._yArr = data[1];
    this._clustersZoom = data[2];
    this._clustersCount = data[3];
    this._clustersFlat = data[4];
    this._clustersFlatNav = data[5];

    const zoomSplitter = data[6];

    const store = (this._store = new Map<number, UintArray>());

    for (let i = zoomSplitter.length, zoom = this._minZoom; i--; ) {
      for (let j = zoomSplitter[i]; j >= 0; j--) {
        store.set(zoom++, data[7 + i] as UintArray);
      }
    }
  }

  private _getPointsMutator<M, C>(
    markerMapper: MarkerMapper<T, M>,
    clusterMapper: ClusterMapper<C>,
    push: Array<M | C>["push"]
  ) {
    const xArr = this._xArr;

    const yArr = this._yArr;

    const points = this.points!;

    const clustersCount = this._clustersCount;

    const clustersZoom = this._clustersZoom;

    const pointsCount = points.length;

    return (index: number) => {
      const x = xArr[index];

      push(
        index < pointsCount
          ? markerMapper(points[index], x)
          : clusterMapper(
              xToLng(x),
              yToLat(yArr[index]),
              clustersCount[(index -= pointsCount)],
              clustersZoom[index] + 1,
              x,
              index
            )
      );
    };
  }

  private _mutatePoints(
    mutate: (index: number) => void,
    ids: UintArray,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number
  ) {
    const xArr = this._xArr;

    const yArr = this._yArr;

    const l = ids.length - 1;

    let start = 0;
    let end = l;

    const fn = (x: number) => {
      const middle = Math.floor((start + end) / 2);

      if (x < xArr[ids[middle]]) {
        end = middle - 1;
      } else {
        start = middle + 1;
      }
    };

    while (xArr[ids[start]] < minX) {
      fn(minX);
    }

    end = l;

    let startIndex = start;

    while (xArr[ids[end]] > maxX) {
      fn(maxX);
    }

    for (++end; startIndex < end; startIndex++) {
      const index = ids[startIndex];

      const y = yArr[index];

      if (y > minY && y < maxY) {
        mutate(index);
      }
    }
  }
}

export default MarkerCluster;
