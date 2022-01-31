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

export const pixelsToDistance = (
  pixels: number,
  extent: number,
  zoom: number
) => pixels / (extent * Math.pow(2, zoom));

export const getData = (
  _pixelsToDistance: typeof pixelsToDistance,
  yOrigin: Float64Array,
  xOrigin: Float64Array,
  minZoom: number,
  maxZoom: number,
  radius: number,
  extent: number
): Data => {
  const pair = (a: number, b: number) => {
    const sum = a + b;

    return (sum * (sum + 1)) / 2 + b;
  };

  const yMap = new Map<number, Map<number, number>>();

  type Duplicate = [items: number[], y: number, x: number];

  const duplicatesMap = new Map<number, Duplicate>();

  const _yAxis: number[] = [];

  const f1 = (i: number) => {
    const y = yOrigin[i];
    const x = xOrigin[i];

    if (yMap.has(y)) {
      const xMap = yMap.get(y)!;

      if (xMap.has(x)) {
        const key = pair(y, x);

        if (duplicatesMap.has(key)) {
          duplicatesMap.get(key)![0].push(i);
        } else {
          duplicatesMap.set(key, [[xMap.get(x)!, i], y, x]);
        }

        return;
      } else {
        xMap.set(x, i);
      }
    } else {
      yMap.set(y, new Map().set(x, i));
    }

    _yAxis.push(y);
  };

  for (let i = yOrigin.length; i--; ) {
    f1(i);
  }

  const clusters: number[] = [];

  const zoomSplitter: number[] = [];

  const clusterEndIndexes: number[] = [];

  const pointsLength = _yAxis.length;

  const yAxis = new Float64Array(_yAxis);
  const xAxis = new Float64Array(pointsLength);
  const ids = new Int32Array(pointsLength);

  for (let i = duplicatesMap.size, iterator = duplicatesMap.values(); i--; ) {
    const v: Duplicate = iterator.next().value;

    const items = v[0];

    yMap.get(v[1])!.set(v[2], -clusters.push(items.length));

    clusters.push(items.length);

    for (let i = items.length; i--; ) {
      clusters.push(items[i]);
    }
  }

  zoomSplitter.push(maxZoom + 1);
  clusterEndIndexes.push(clusters.length);

  yAxis.sort();

  let i = pointsLength;

  const f2 = () => {
    const v = yMap.get(yAxis[i++])!;

    const keys = v.keys();

    const f1 = () => {
      i--;

      const x = keys.next().value;

      xAxis[i] = x;

      ids[i] = v.get(x)!;
    };

    for (let j = v.size; j--; ) {
      f1();
    }
  };

  while (i--) {
    f2();
  }

  const data: PointsData = [yAxis, xAxis, ids];

  const fn3 = (z: number) => {
    const r = _pixelsToDistance(radius, extent, z);
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

    let i = 0;

    const fn1 = () => {
      const y = prevYAxis[i];
      const x = prevXAxis[i];

      while (y > _yAxis[startIndex] + r2) {
        startIndex++;
      }

      let j = startIndex;

      const fn1 = () => {
        const _x = _xAxis[j];

        if (x >= _x - r && x <= _x + r) {
          const _y = _yAxis[j];

          const id = prevIds[i];

          const key = pair(_y, _x);

          if (clustersMap.has(key)) {
            const v = clustersMap.get(key)!;

            v[0] += y;
            v[1] += x;
            v[2].push(id);
          } else {
            const _xMap = yMap.get(_y)!;

            clustersMap.set(key, [_y + y, _x + x, [_xMap.get(_x)!, id], j]);

            if (_xMap.size == 1) {
              yMap.delete(_y);
            } else {
              _xMap.delete(_x);
            }
          }

          const xMap = yMap.get(y)!;

          return xMap.size == 1 ? yMap.delete(y) : xMap.delete(x);
        }

        j++;

        return false;
      };

      const fn2 = () => {
        const l = _yAxis.length;

        while (j < l) {
          if (fn1()) return false;
        }

        return true;
      };

      if (fn2()) {
        _yAxis.push(y);
        _xAxis.push(x);
      }

      i++;
    };

    while (i < pointsLength) {
      fn1();
    }

    if (clustersMap.size) {
      const yAxis = new Float64Array(_yAxis);

      const iterator = clustersMap.values();

      const fn1 = () => {
        const v: ClusterTuple = iterator.next().value;

        const items = v[2];

        const count = items.length;

        const y = v[0] / count;

        if (yMap.has(y)) {
          yMap.get(y)!.set(v[1] / count, -clusters.push(count));
        } else {
          yMap.set(y, new Map().set(v[1] / count, -clusters.push(count)));
        }

        let allCount = 0;

        const index = clusters.length;

        clusters.push(0);

        for (let i = count; i--; ) {
          const id = items[i];

          clusters.push(id);

          allCount += id < 0 ? clusters[-id] : 1;
        }

        clusters[index] = allCount;

        yAxis[v[3]] = y;
      };

      for (let i = clustersMap.size; i--; ) {
        fn1();
      }

      yAxis.sort();

      const l = yAxis.length;

      const xAxis = new Float64Array(l);
      const ids = new Int32Array(l);

      let i = l;

      const f2 = () => {
        const v = yMap.get(yAxis[i++])!;

        const keys = v.keys();

        const f1 = () => {
          i--;

          const x = keys.next().value;

          xAxis[i] = x;

          ids[i] = v.get(x)!;
        };

        for (let j = v.size; j--; ) {
          f1();
        }
      };

      while (i--) {
        f2();
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
