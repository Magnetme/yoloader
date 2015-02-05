module.exports = function(count, callback) {
	function checkDone() {
		if (count === 0) {
			callback();
		}
	}
	return {
		countDown : function countDown() {
			count--;
			checkDone();
		},
		cancel : function cancel() {
			count = 0;
			//Don't check if done, we're cancelling here
		}
	};
};
