import { readFile } from "fs/promises";
import test from "ava";
import { prepare } from "../src/module.js";

test("simple build", async (t) => {
    await prepare({
        src: "tests/example.js",
        dist: "tests/dist",
    });
    t.is(
        await readFile("./tests/dist/example.js", "utf-8"),
        await readFile("./tests/expect-example.txt", "utf-8")
    );
});

test("simple build jsx", async (t) => {
    await prepare({
        src: "tests/atomico.jsx",
        dist: "tests/dist",
    });
    t.is(
        await readFile("./tests/dist/atomico.js", "utf-8"),
        await readFile("./tests/expect-atomico.txt", "utf-8")
    );
});
