# `signal`

The `signal` method allows creating reactive variables that automatically update their subscribers when the value changes.

## Syntax

```javascript
engine.signal(initialValue, optionsOrName)
```

## Parameters

- **initialValue** (`T`): The initial value of the signal.
- **optionsOrName** (`string | SignalOptions<T>`): Name or options for the signal.

## Return Value

The method returns a `Signal` object with the following properties and methods:

- **`value`**: The value of the signal.
- **`subscribe(cb: (val: T) => void)`**: Subscribe to changes in the signal's value. Returns a cleanup function.

## Examples

### Example in plain JavaScripts

```javascript
const engine = new ReactiveEngine();
const count = engine.signal(0);

count.subscribe((newValue) => {
  console.log(`Count is now ${newValue}`);
});

count.value++; // Outputs: Count is now 1
```

## Additional Information

Signals are a fundamental part of the reactive system, allowing automatic updates to UI and other dependencies when values change.
