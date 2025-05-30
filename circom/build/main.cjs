'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var ffjavascript = require('ffjavascript');

/*

Copyright 2020 0KIMS association.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

*/

function flatArray(a) {
    let res = [];
    fillArray(res, a);
    return res;

    function fillArray(res, a) {
        if (Array.isArray(a)) {
            for (let i = 0; i < a.length; i++) {
                fillArray(res, a[i]);
            }
        } else {
            res.push(a);
        }
    }
}

// Ref https://github.com/iden3/circom/commit/ec6388cf6eb62463539cb4c40cc3ceae9826de19
function normalize(n, prime) {
    let res = BigInt(n) % prime;
    if (res < 0) res += prime;
    return res;
}

function fnvHash(str) {
    const uint64_max = BigInt(2) ** BigInt(64);
    let hash = BigInt("0xCBF29CE484222325");
    for (let i = 0; i < str.length; i++) {
        hash ^= BigInt(str[i].charCodeAt(0));
        hash *= BigInt(0x100000001B3);
        hash %= uint64_max;
    }
    let shash = hash.toString(16);
    let n = 16 - shash.length;
    shash = "0".repeat(n).concat(shash);
    return shash;
}

// Note that this pads zeros
function toArray32(s, size) {
    const res = []; //new Uint32Array(size); //has no unshift
    let rem = BigInt(s);
    const radix = BigInt(0x100000000);
    while (rem) {
        res.unshift(Number(rem % radix));
        rem = rem / radix;
    }
    if (size) {
        let i = size - res.length;
        while (i > 0) {
            res.unshift(0);
            i--;
        }
    }
    return res;
}

/* globals WebAssembly */

async function builder(code, options) {
    let instance;
    let wc;
    let memory;
    options = options || {};

    // Only circom 2 implements version lookup through exports in the WASM
    // We default to `1` and update if we see the `getVersion` export (major version)
    // These are updated after the instance is instantiated, assuming the functions are available
    let majorVersion = 1;
    // After Circom 2.0.7, Blaine added exported functions for getting minor and patch versions
    let minorVersion = 0;
    // If we can't look up the patch version, assume the lowest
    let patchVersion = 0;

    let codeIsWebAssemblyInstance = false;

    // If code is already prepared WebAssembly.Instance, we use it directly
    if (code instanceof WebAssembly.Instance) {
        instance = code;
        codeIsWebAssemblyInstance = true;
    } else {
        let memorySize = 32767;

        if (options.memorySize) {
            // make sure we have int
            memorySize = parseInt(options.memorySize);
            if (memorySize < 0) {
                throw new Error("Invalid memory size");
            }
        }

        let memoryAllocated = false;
        while (!memoryAllocated) {
            try {
                memory = new WebAssembly.Memory({initial: memorySize});
                memoryAllocated = true;
            } catch (err) {
                if (memorySize <= 1) {
                    throw err;
                }
                console.warn("Could not allocate " + memorySize * 1024 * 64 + " bytes. This may cause severe instability. Trying with " + memorySize * 1024 * 64 / 2 + " bytes");
                memorySize = Math.floor(memorySize / 2);
            }
        }

        const wasmModule = await WebAssembly.compile(code);

        let errStr = "";
        let msgStr = "";

        instance = await WebAssembly.instantiate(wasmModule, {
            env: {
                "memory": memory
            },
            runtime: {
                printDebug : function(value) {
                    console.log("printDebug:", value);
                },
                exceptionHandler: function (code) {
                    let err;
                    if (code === 1) {
                        err = "Signal not found. ";
                    } else if (code === 2) {
                        err = "Too many signals set. ";
                    } else if (code === 3) {
                        err = "Signal already set. ";
                    } else if (code === 4) {
                        err = "Assert Failed. ";
                    } else if (code === 5) {
                        err = "Not enough memory. ";
                    } else if (code === 6) {
                        err = "Input signal array access exceeds the size. ";
                    } else {
                        err = "Unknown error. ";
                    }
                    console.error("ERROR: ", code, errStr);
                    throw new Error(err + errStr);
                },
                // A new way of logging messages was added in Circom 2.0.7 that requires 2 new imports
                // `printErrorMessage` and `writeBufferMessage`.
                printErrorMessage: function () {
                    errStr += getMessage() + "\n";
                },
                writeBufferMessage: function () {
                    const msg = getMessage();
                    // Any calls to `log()` will always end with a `\n`, so that's when we print and reset
                    if (msg === "\n") {
                        console.log(msgStr);
                        msgStr = "";
                    } else {
                        // If we've buffered other content, put a space in between the items
                        if (msgStr !== "") {
                            msgStr += " ";
                        }
                        // Then append the message to the message we are creating
                        msgStr += msg;
                    }
                },
                showSharedRWMemory: function () {
                    const shared_rw_memory_size = instance.exports.getFieldNumLen32();
                    const arr = new Uint32Array(shared_rw_memory_size);
                    for (let j = 0; j < shared_rw_memory_size; j++) {
                        arr[shared_rw_memory_size - 1 - j] = instance.exports.readSharedRWMemory(j);
                    }

                    // In circom 2.0.7, they changed the log() function to allow strings and changed the
                    // output API. This smoothes over the breaking change.
                    if (majorVersion >= 2 && (minorVersion >= 1 || patchVersion >= 7)) {
                        // If we've buffered other content, put a space in between the items
                        if (msgStr !== "") {
                            msgStr += " ";
                        }
                        // Then append the value to the message we are creating
                        const msg = (ffjavascript.Scalar.fromArray(arr, 0x100000000).toString());
                        msgStr += msg;
                    } else {
                        console.log(ffjavascript.Scalar.fromArray(arr, 0x100000000));
                    }
                },
                error: function (code, pstr, a, b, c, d) {
                    let errStr;
                    if (code === 7) {
                        errStr = p2str(pstr) + " " + wc.getFr(b).toString() + " != " + wc.getFr(c).toString() + " " + p2str(d);
                    } else if (code === 9) {
                        errStr = p2str(pstr) + " " + wc.getFr(b).toString() + " " + p2str(c);
                    } else if ((code === 5) && (options.sym)) {
                        errStr = p2str(pstr) + " " + options.sym.labelIdx2Name[c];
                    } else {
                        errStr = p2str(pstr) + " " + a + " " + b + " " + c + " " + d;
                    }
                    console.log("ERROR: ", code, errStr);
                    throw new Error(errStr);
                },
                log: function (a) {
                    console.log(wc.getFr(a).toString());
                },
                logGetSignal: function (signal, pVal) {
                    if (options.logGetSignal) {
                        options.logGetSignal(signal, wc.getFr(pVal));
                    }
                },
                logSetSignal: function (signal, pVal) {
                    if (options.logSetSignal) {
                        options.logSetSignal(signal, wc.getFr(pVal));
                    }
                },
                logStartComponent: function (cIdx) {
                    if (options.logStartComponent) {
                        options.logStartComponent(cIdx);
                    }
                },
                logFinishComponent: function (cIdx) {
                    if (options.logFinishComponent) {
                        options.logFinishComponent(cIdx);
                    }
                }
            }
        });
    }

    if (typeof instance.exports.getVersion == "function") {
        majorVersion = instance.exports.getVersion();
    }
    if (typeof instance.exports.getMinorVersion == "function") {
        minorVersion = instance.exports.getMinorVersion();
    }
    if (typeof instance.exports.getPatchVersion == "function") {
        patchVersion = instance.exports.getPatchVersion();
    }

    const sanityCheck =
        options &&
        (
            options.sanityCheck ||
            options.logGetSignal ||
            options.logSetSignal ||
            options.logStartComponent ||
            options.logFinishComponent
        );

    // We explicitly check for major version 2 in case there's a circom v3 in the future
    if (majorVersion === 2) {
        wc = new WitnessCalculatorCircom2(instance, sanityCheck);
    } else if (majorVersion === 1) {
        if (codeIsWebAssemblyInstance) {
            throw new Error('Loading code from WebAssembly instance is not supported for circom version 1');
        }
        wc = new WitnessCalculatorCircom1(memory, instance, sanityCheck);
    } else {
        throw new Error(`Unsupported circom version: ${majorVersion}`);
    }
    return wc;

    function getMessage() {
        let message = "";
        let c = instance.exports.getMessageChar();
        while (c !== 0) {
            message += String.fromCharCode(c);
            c = instance.exports.getMessageChar();
        }
        return message;
    }

    function p2str(p) {
        const i8 = new Uint8Array(memory.buffer);

        const bytes = [];

        for (let i = 0; i8[p + i] > 0; i++) bytes.push(i8[p + i]);

        return String.fromCharCode.apply(null, bytes);
    }
}

class WitnessCalculatorCircom1 {
    constructor(memory, instance, sanityCheck) {
        this.memory = memory;
        this.i32 = new Uint32Array(memory.buffer);
        this.instance = instance;

        this.n32 = (this.instance.exports.getFrLen() >> 2) - 2;
        const pRawPrime = this.instance.exports.getPRawPrime();

        const arr = new Array(this.n32);
        for (let i = 0; i < this.n32; i++) {
            arr[this.n32 - 1 - i] = this.i32[(pRawPrime >> 2) + i];
        }

        this.prime = ffjavascript.Scalar.fromArray(arr, 0x100000000);

        this.Fr = new ffjavascript.F1Field(this.prime);

        this.mask32 = ffjavascript.Scalar.fromString("FFFFFFFF", 16);
        this.NVars = this.instance.exports.getNVars();
        this.n64 = Math.floor((this.Fr.bitLength - 1) / 64) + 1;
        this.R = this.Fr.e(ffjavascript.Scalar.shiftLeft(1, this.n64 * 64));
        this.RInv = this.Fr.inv(this.R);
        this.sanityCheck = sanityCheck;
    }

    circom_version() {
        return 1;
    }

    async _doCalculateWitness(input, sanityCheck) {
        this.instance.exports.init((this.sanityCheck || sanityCheck) ? 1 : 0);
        const pSigOffset = this.allocInt();
        const pFr = this.allocFr();
        const keys = Object.keys(input);
        keys.forEach((k) => {
            const h = fnvHash(k);
            const hMSB = parseInt(h.slice(0, 8), 16);
            const hLSB = parseInt(h.slice(8, 16), 16);
            try {
                this.instance.exports.getSignalOffset32(pSigOffset, 0, hMSB, hLSB);
            } catch (err) {
                throw new Error(`Signal ${k} is not an input of the circuit.`);
            }
            const sigOffset = this.getInt(pSigOffset);
            const fArr = flatArray(input[k]);
            for (let i = 0; i < fArr.length; i++) {
                this.setFr(pFr, fArr[i]);
                this.instance.exports.setSignal(0, 0, sigOffset + i, pFr);
            }
        });
    }

    async calculateWitness(input, sanityCheck) {
        const self = this;

        const old0 = self.i32[0];
        const w = [];

        await self._doCalculateWitness(input, sanityCheck);

        for (let i = 0; i < self.NVars; i++) {
            const pWitness = self.instance.exports.getPWitness(i);
            w.push(self.getFr(pWitness));
        }

        self.i32[0] = old0;
        return w;
    }

    async calculateBinWitness(input, sanityCheck) {
        const self = this;

        const old0 = self.i32[0];

        await self._doCalculateWitness(input, sanityCheck);

        const pWitnessBuffer = self.instance.exports.getWitnessBuffer();

        self.i32[0] = old0;

        const buff = self.memory.buffer.slice(pWitnessBuffer, pWitnessBuffer + (self.NVars * self.n64 * 8));
        return new Uint8Array(buff);
    }

    allocInt() {
        const p = this.i32[0];
        this.i32[0] = p + 8;
        return p;
    }

    allocFr() {
        const p = this.i32[0];
        this.i32[0] = p + this.n32 * 4 + 8;
        return p;
    }

    getInt(p) {
        return this.i32[p >> 2];
    }

    setInt(p, v) {
        this.i32[p >> 2] = v;
    }

    getFr(p) {
        const self = this;
        const idx = (p >> 2);

        if (self.i32[idx + 1] & 0x80000000) {
            const arr = new Array(self.n32);
            for (let i = 0; i < self.n32; i++) {
                arr[self.n32 - 1 - i] = self.i32[idx + 2 + i];
            }
            const res = self.Fr.e(ffjavascript.Scalar.fromArray(arr, 0x100000000));
            if (self.i32[idx + 1] & 0x40000000) {
                return fromMontgomery(res);
            } else {
                return res;
            }

        } else {
            if (self.i32[idx] & 0x80000000) {
                return self.Fr.e(self.i32[idx] - 0x100000000);
            } else {
                return self.Fr.e(self.i32[idx]);
            }
        }

        function fromMontgomery(n) {
            return self.Fr.mul(self.RInv, n);
        }

    }


    setFr(p, v) {
        const self = this;

        v = self.Fr.e(v);

        const minShort = self.Fr.neg(self.Fr.e("80000000", 16));
        const maxShort = self.Fr.e("7FFFFFFF", 16);

        if ((self.Fr.geq(v, minShort))
            && (self.Fr.leq(v, maxShort))) {
            let a;
            if (self.Fr.geq(v, self.Fr.zero)) {
                a = ffjavascript.Scalar.toNumber(v);
            } else {
                a = ffjavascript.Scalar.toNumber(self.Fr.sub(v, minShort));
                a = a - 0x80000000;
                a = 0x100000000 + a;
            }
            self.i32[(p >> 2)] = a;
            self.i32[(p >> 2) + 1] = 0;
            return;
        }

        self.i32[(p >> 2)] = 0;
        self.i32[(p >> 2) + 1] = 0x80000000;
        const arr = ffjavascript.Scalar.toArray(v, 0x100000000);
        for (let i = 0; i < self.n32; i++) {
            const idx = arr.length - 1 - i;

            if (idx >= 0) {
                self.i32[(p >> 2) + 2 + i] = arr[idx];
            } else {
                self.i32[(p >> 2) + 2 + i] = 0;
            }
        }
    }
}

class WitnessCalculatorCircom2 {
    constructor(instance, sanityCheck) {
        this.instance = instance;

        this.version = this.instance.exports.getVersion();
        this.n32 = this.instance.exports.getFieldNumLen32();

        this.instance.exports.getRawPrime();
        const arr = new Uint32Array(this.n32);
        for (let i = 0; i < this.n32; i++) {
            arr[this.n32 - 1 - i] = this.instance.exports.readSharedRWMemory(i);
        }
        this.prime = ffjavascript.Scalar.fromArray(arr, 0x100000000);

        this.witnessSize = this.instance.exports.getWitnessSize();

        this.sanityCheck = sanityCheck;
    }

    circom_version() {
        return this.instance.exports.getVersion();
    }

    async _doCalculateWitness(input, sanityCheck) {
        //input is assumed to be a map from signals to arrays of bigints
        this.instance.exports.init((this.sanityCheck || sanityCheck) ? 1 : 0);
        const keys = Object.keys(input);
        let input_counter = 0;
        keys.forEach((k) => {
            const h = fnvHash(k);
            const hMSB = parseInt(h.slice(0, 8), 16);
            const hLSB = parseInt(h.slice(8, 16), 16);
            const fArr = flatArray(input[k]);
            // Slight deviation from https://github.com/iden3/circom/blob/v2.1.6/code_producers/src/wasm_elements/common/witness_calculator.js
            // because I don't know when this exported function was added
            if (typeof this.instance.exports.getInputSignalSize === "function") {
                let signalSize = this.instance.exports.getInputSignalSize(hMSB, hLSB);
                if (signalSize < 0) {
                    throw new Error(`Signal ${k} not found\n`);
                }
                if (fArr.length < signalSize) {
                    throw new Error(`Not enough values for input signal ${k}\n`);
                }
                if (fArr.length > signalSize) {
                    throw new Error(`Too many values for input signal ${k}\n`);
                }
            }
            for (let i = 0; i < fArr.length; i++) {
                const arrFr = toArray32(normalize(fArr[i], this.prime), this.n32);
                for (let j = 0; j < this.n32; j++) {
                    this.instance.exports.writeSharedRWMemory(j, arrFr[this.n32 - 1 - j]);
                }
                try {
                    this.instance.exports.setInputSignal(hMSB, hLSB, i);
                    input_counter++;
                } catch (err) {
                    // console.log(`After adding signal ${i} of ${k}`)
                    throw new Error(err);
                }
            }

        });
        if (input_counter < this.instance.exports.getInputSize()) {
            throw new Error(`Not all inputs have been set. Only ${input_counter} out of ${this.instance.exports.getInputSize()}`);
        }
    }

    async calculateWitness(input, sanityCheck) {
        const w = [];

        await this._doCalculateWitness(input, sanityCheck);

        for (let i = 0; i < this.witnessSize; i++) {
            this.instance.exports.getWitness(i);
            const arr = new Uint32Array(this.n32);
            for (let j = 0; j < this.n32; j++) {
                arr[this.n32 - 1 - j] = this.instance.exports.readSharedRWMemory(j);
            }
            w.push(ffjavascript.Scalar.fromArray(arr, 0x100000000));
        }

        return w;
    }

    async calculateWTNSBin(input, sanityCheck) {
        const buff32 = new Uint32Array(this.witnessSize * this.n32 + this.n32 + 11);
        const buff = new Uint8Array(buff32.buffer);
        await this._doCalculateWitness(input, sanityCheck);

        //"wtns"
        buff[0] = "w".charCodeAt(0);
        buff[1] = "t".charCodeAt(0);
        buff[2] = "n".charCodeAt(0);
        buff[3] = "s".charCodeAt(0);

        //version 2
        buff32[1] = 2;

        //number of sections: 2
        buff32[2] = 2;

        //id section 1
        buff32[3] = 1;

        const n8 = this.n32 * 4;
        //id section 1 length in 64bytes
        const idSection1length = 8 + n8;
        const idSection1lengthHex = idSection1length.toString(16);
        buff32[4] = parseInt(idSection1lengthHex.slice(0, 8), 16);
        buff32[5] = parseInt(idSection1lengthHex.slice(8, 16), 16);

        //this.n32
        buff32[6] = n8;

        //prime number
        this.instance.exports.getRawPrime();

        let pos = 7;
        for (let j = 0; j < this.n32; j++) {
            buff32[pos + j] = this.instance.exports.readSharedRWMemory(j);
        }
        pos += this.n32;

        // witness size
        buff32[pos] = this.witnessSize;
        pos++;

        //id section 2
        buff32[pos] = 2;
        pos++;

        // section 2 length
        const idSection2length = n8 * this.witnessSize;
        const idSection2lengthHex = idSection2length.toString(16);
        buff32[pos] = parseInt(idSection2lengthHex.slice(0, 8), 16);
        buff32[pos + 1] = parseInt(idSection2lengthHex.slice(8, 16), 16);

        pos += 2;
        for (let i = 0; i < this.witnessSize; i++) {
            this.instance.exports.getWitness(i);
            for (let j = 0; j < this.n32; j++) {
                buff32[pos + j] = this.instance.exports.readSharedRWMemory(j);
            }
            pos += this.n32;
        }

        return buff;
    }

}

exports.WitnessCalculatorBuilder = builder;
