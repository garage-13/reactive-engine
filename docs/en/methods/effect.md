# `effect`

The `effect` method allows you to create automatic functions that execute when dependent signals change. These effects can be used to update the UI or other dependencies.

## Syntax

```javascript
engine.effect(fn, label)
```

## Parameters

- **fn** (`EffectFn`): The effect function that will be executed when dependent signals change.
- **label** (`string`, optional): A label for logging and debugging purposes.

## Return Value

The method returns a cleanup function. Calling this function removes the effect and its subscribers.

## Examples

### Example in plain JavaScript

```javascript
const engine = new ReactiveEngine();
const count = engine.signal(0);

engine.effect(() => {
  console.log(`Count is now ${count.value}`);
});

count.value++; // Outputs: Count is now 1
```

## Additional Information

Effects are an important part of the reactive system, allowing automatic updates to the UI and other dependencies when signal values change.
