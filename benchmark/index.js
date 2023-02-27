import Supercluster from "supercluster";
import MarkerCluster from "../dist/index.cjs";
import Benchmark from "benchmark";

const round = (a, b) => {
  const c = Math.pow(10, b);

  return Math.round(a * c) / c;
};

const getRandomLocations = (count) =>
  Array.from({ length: count }, (_, index) => ({
    id: index,
    geometry: {
      coordinates: [
        round(Math.random() * (180 * 2) - 180, 6),
        round(Math.random() * (85 * 2) - 85, 6),
      ],
    },
  }));

const options = { radius: 60, extent: 256, minZoom: 0, maxZoom: 16 };

const markerCluster = new MarkerCluster(
  (item) => item.geometry.coordinates,
  options
);

const supercluster = new Supercluster(options);

[1000, 10000, 100000].forEach((count) => {
  const randomLocations = getRandomLocations(count);

  new Benchmark.Suite()
    .add("marker-cluster", () => {
      markerCluster.load(randomLocations);
    })
    .add("supercluster", () => {
      supercluster.load(randomLocations);
    })
    .on("cycle", ({ target }) => {
      console.log(String(target));
    })
    .on("complete", function () {
      console.log(
        `Fastest in loading ${new Intl.NumberFormat("en").format(
          randomLocations.length
        )} points is ${this.filter("fastest").map("name")}\n`
      );
    })
    .run();
});
