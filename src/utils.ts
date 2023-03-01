import { Data } from "./types";

export function noop() {}

export const clamp = (min: number, value: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const lngToX = (lng: number) => 0.5 + lng / 360;

const _4pi = 4 * Math.PI;
const rad = 180 / Math.PI;

export const latToY = (lat: number) => {
  const sin = Math.sin(lat / rad);

  return clamp(0, 0.5 - Math.log((1 + sin) / (1 - sin)) / _4pi, 1);
};

export const boundedLngToX = (lng: number) =>
  lngToX(((((lng + 180) % 360) + 360) % 360) - 180);

export const boundedLatToY = (lat: number) => latToY(clamp(-90, lat, 90));

export const xToLng = (x: number) => (Math.min(x, 1) - 0.5) * 360;

export const yToLat = (y: number) =>
  2 * rad * Math.atan(Math.exp((1 - y * 2) * Math.PI)) - 90;

export const pixelsToDistance = (
  pixels: number,
  extent: number,
  zoom: number
) => pixels / (extent * Math.pow(2, zoom));

export const getMaxPossibleCount = (
  pointsCount: number,
  maxZoom: number,
  minZoom: number
) => {
  const diff = maxZoom - minZoom;

  let n = pointsCount;

  for (let i = 0; i < diff; i++) {
    n = Math.floor(n / 2);

    pointsCount += n;
  }

  return pointsCount;
};

export const getTypedArray = (max: number) =>
  max < 256 ? Uint8Array : max < 65536 ? Uint16Array : Uint32Array;

export const getData = (
  xAxis: Float64Array,
  xArr: Float64Array,
  yArr: Float64Array,
  minZoom: number,
  maxZoom: number,
  radius: number,
  extent: number,
  dataMap: Map<number, number>,
  _pixelsToDistance: typeof pixelsToDistance,
  _getTypedArray: typeof getTypedArray
): Data => {
  const value = new Array(7);

  const pointsCount = xAxis.sort().length;

  const maxPossibleCount = xArr.length;

  const maxPossibleClustersCount = maxPossibleCount - pointsCount;

  let parentPoints = new (_getTypedArray(pointsCount))(pointsCount);

  const TypedArray = _getTypedArray(maxPossibleCount);

  const clustersZoom = new Uint8Array(maxPossibleClustersCount);
  const clustersCount = new (_getTypedArray(maxPossibleClustersCount))(
    maxPossibleClustersCount
  );
  const clustersFlat = new TypedArray(maxPossibleCount);
  const clustersFlatNav = new TypedArray(maxPossibleClustersCount + 1);

  const queuePoints = new TypedArray((pointsCount || 1) - 1);

  const zoomSplitter = new Uint8Array(maxZoom - minZoom + 2);

  let zoomSplitterIndex = 0;

  let currClustersFlatIndex = 1;

  for (let i = 0; i < pointsCount; i++) {
    parentPoints[i] = dataMap.get(xAxis[i])!;
  }

  value.push(parentPoints);

  const clustering = (zoom: number) => {
    const parentPointsLength = parentPoints.length;

    const nextZoomXAxis = new Float64Array(parentPointsLength);

    const r = _pixelsToDistance(radius, extent, zoom);

    const d = r * 2;

    let nextZoomIndex = 0;

    let stoppedAt = 0;

    let queueIndex = 0;

    const executeQueue = () => {
      let nextQueueIndex = 0;

      const currIndex = queueIndex ? queuePoints[0] : parentPoints[stoppedAt++];

      let clusterSize = 1;

      let trueClusterSize = 0;

      let sumX = xArr[currIndex];
      let sumY = yArr[currIndex];

      const maxPossibleX = sumX + d;

      const maxPossibleY = sumY + r;
      const minPossibleY = sumY - r;

      for (let i = 1; i < queueIndex; i++) {
        const index = queuePoints[i];

        const y = yArr[index];

        if (y < maxPossibleY && y > minPossibleY) {
          sumX += xArr[index];

          sumY += y;

          clusterSize++;

          clustersFlat[currClustersFlatIndex++] = index;

          trueClusterSize +=
            ((index < pointsCount) as any) ||
            clustersCount[index - pointsCount];
        } else {
          queuePoints[nextQueueIndex++] = index;
        }
      }

      for (; stoppedAt < parentPointsLength; stoppedAt++) {
        const index = parentPoints[stoppedAt];

        const x = xArr[index];

        if (x < maxPossibleX) {
          const y = yArr[index];

          if (y < maxPossibleY && y > minPossibleY) {
            sumX += x;

            sumY += y;

            clusterSize++;

            clustersFlat[currClustersFlatIndex++] = index;

            trueClusterSize +=
              ((index < pointsCount) as any) ||
              clustersCount[index - pointsCount];
          } else {
            queuePoints[nextQueueIndex++] = index;
          }
        } else {
          break;
        }
      }

      if (trueClusterSize) {
        sumX /= clusterSize;

        while (dataMap.has(sumX)) {
          sumX += Number.EPSILON;
        }

        const clusterIndex = dataMap.size;

        const index = clusterIndex - pointsCount;

        dataMap.set(sumX, clusterIndex);

        xArr[clusterIndex] = sumX;

        yArr[clusterIndex] = sumY / clusterSize;

        clustersZoom[index] = zoom;

        clustersCount[index] =
          trueClusterSize +
          (((currIndex < pointsCount) as any) ||
            clustersCount[currIndex - pointsCount]);

        clustersFlat[clustersFlatNav[index]] = currIndex;

        clustersFlatNav[index + 1] = currClustersFlatIndex++;
      }

      nextZoomXAxis[nextZoomIndex++] = sumX;

      queueIndex = nextQueueIndex;
    };

    while (stoppedAt < parentPointsLength || queueIndex > 1) {
      executeQueue();
    }

    if (queueIndex) {
      nextZoomXAxis[nextZoomIndex++] = xArr[queuePoints[0]];
    }

    if (nextZoomIndex < parentPointsLength) {
      const xAxis = nextZoomXAxis.subarray(0, nextZoomIndex).sort();

      parentPoints = new (_getTypedArray(dataMap.size))(nextZoomIndex);

      for (let i = 0; i < nextZoomIndex; i++) {
        parentPoints[i] = dataMap.get(xAxis[i])!;
      }

      value.push(parentPoints);

      zoomSplitterIndex++;
    } else {
      zoomSplitter[zoomSplitterIndex]++;
    }
  };

  for (let zoom = maxZoom; zoom >= minZoom; zoom--) {
    clustering(zoom);
  }

  const maxIndex = dataMap.size;

  const maxClustersIndex = maxIndex - pointsCount;

  value[0] = xArr.subarray(0, maxIndex);
  value[1] = yArr.subarray(0, maxIndex);
  value[2] = clustersZoom.subarray(0, maxClustersIndex);
  value[3] = clustersCount.subarray(0, maxClustersIndex);
  value[4] = clustersFlat.subarray(0, currClustersFlatIndex);
  value[5] = clustersFlatNav.subarray(0, maxClustersIndex + 1);
  value[6] = zoomSplitter.subarray(0, zoomSplitterIndex + 1);

  return value as any;
};
