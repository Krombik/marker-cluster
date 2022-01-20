import { Data, PointsData } from "./types";

export const clamp = (min: number, value: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const lngToX = (lng: number) => lng / 360 + 0.5;

export const latToY = (lat: number) => {
  const sin = Math.sin((lat * Math.PI) / 180);

  return clamp(0, 0.5 - (0.25 * Math.log((1 + sin) / (1 - sin))) / Math.PI, 1);
};

export const boundedLngToX = (lng: number) =>
  lngToX(((((lng + 180) % 360) + 360) % 360) - 180);

export const boundedLatToY = (lat: number) => latToY(clamp(-90, lat, 90));

export const xToLng = (x: number) => (x - 0.5) * 360;

export const yToLat = (y: number) =>
  (360 * Math.atan(Math.exp((1 - y * 2) * Math.PI))) / Math.PI - 90;

export const pair = (a: number, b: number) => {
  const sum = a + b;

  return (sum * (sum + 1)) / 2 + b;
};

export const pixelsToDistance = (
  pixels: number,
  extent: number,
  zoom: number
) => pixels / (extent * Math.pow(2, zoom));

export const getData = (
  yOrigin: Float64Array,
  xOrigin: Float64Array,
  minZoom: number,
  maxZoom: number,
  radius: number,
  extent: number
): Data => {
  const map = new Map<number, [index: number, x: number]>();

  const pointsLength = yOrigin.length;

  const yAxis = new Float64Array(pointsLength);
  const xAxis = new Float64Array(pointsLength);
  const ids = new Int32Array(pointsLength);

  const f1 = (i: number) => {
    let y = yOrigin[i];

    while (map.has(y)) {
      y += Number.EPSILON;
    }

    map.set(y, [i, xOrigin[i]]);

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

    type ClusterTuple = [y: number, x: number, items: number[], index: number];

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

  return [
    data,
    new Int8Array(zoomSplitter),
    new Int32Array(clusters),
    new Int32Array(clusterEndIndexes),
  ];
};
