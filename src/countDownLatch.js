module.exports = function countDownLatch(count, callback) {
	function checkDone() {
		if (count === 0) {
			callback();
		}
	}
	checkDone();
	return {
		countDown () {
			count--;
			checkDone();
		},
		cancel () {
			count = 0;
			//Don't check if done, we're cancelling here
		}
	};
};
