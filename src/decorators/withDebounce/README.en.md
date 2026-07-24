The `withDebounce` decorator is an optimization tool used in scenarios with a high event rate, where a strictly final result is important after the flow of actions has completely stopped or is quiet for a certain period of time.

Unlike throttling, debounce completely ignores intermediate states and resets the wait timer with each new user action. The request is sent only once when the "quiet" phase occurs.
