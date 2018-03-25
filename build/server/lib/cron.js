'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _moment = require('moment');

var _moment2 = _interopRequireDefault(_moment);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// In ms.
const WAKEUP_INTERVAL = 20 * 60 * 1000;

class Cron {
    constructor(func) {
        // The function to run at the given date.
        this.func = func;

        // A timeout identifier (created by setTimeout) used only to run the
        // passed function.
        this.runTimeout = null;

        // Time in ms to the next run.
        this.timeToNextRun = null;

        // An interval used to wake up at a lower granularity than the
        // runTimeout, to work around a bug of low-end devices like Raspberry
        // PI.
        this.wakeUpInterval = setInterval(() => {
            if (this.timeToNextRun === null) {
                return;
            }

            if (this.timeToNextRun < WAKEUP_INTERVAL) {
                this.runTimeout = setTimeout(this.func, Math.max(0, this.timeToNextRun));
                this.timeToNextRun = null;
            } else {
                this.timeToNextRun = this.timeToNextRun - WAKEUP_INTERVAL;
            }
        }, WAKEUP_INTERVAL);
    }

    setNextUpdate(nextUpdate) {
        if (this.runTimeout !== null) {
            clearTimeout(this.runTimeout);
            this.runTimeout = null;
        }
        this.timeToNextRun = nextUpdate.diff((0, _moment2.default)());
    }
}

exports.default = Cron;