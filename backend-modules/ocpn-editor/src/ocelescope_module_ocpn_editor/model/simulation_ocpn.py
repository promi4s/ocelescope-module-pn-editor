import inspect
import pygame
from simpn.simulator import SimToken, SimVar, SimVarQueue, SimEvent, SimProblem
import simpn.visualisation as vis
import math
import re
import hashlib

TASK_TOKEN_SHOW_COLOURS = [
    pygame.Color("#2E86AB"),  # Deep blue
    pygame.Color("#A23B72"),  # Magenta
    pygame.Color("#F18F01"),  # Orange
    pygame.Color("#C73E1D"),  # Red
    pygame.Color("#6A994E"),  # Green
    pygame.Color("#7209B7"),  # Purple
    pygame.Color("#F77F00"),  # Dark orange
    pygame.Color("#06A77D"),  # Teal
    pygame.Color("#6C757D"),  # Gray
]

class TimedSimVarQueue(SimVarQueue):
    """A time-aware variable-arc queue.

    The default SimVarQueue bundles every underlying token into a single token at
    time 0, which makes variable arcs ignore time entirely: events fire regardless
    of token availability and the simulation clock can never advance to a queue's
    future tokens (causing deadlocks when the only remaining work is future-timed).

    This queue instead presents:
      - one bundle of all tokens available now (time <= clock), timed at the earliest
        available time so the event is bindable immediately and the selection sees all
        currently-available tokens; plus
      - one cumulative prefix per distinct future arrival time (each containing every
        token up to that time), so SimPN's look_beyond binding search can advance the
        clock to the moment a guard becomes satisfiable and re-evaluate it there.

    Because availability is encoded in which bundle/prefix is presented (and gated by
    SimPN's _sorted_by_time / max_time logic), guards must stay time-independent; the
    OCPNEvent wrappers therefore pass the full bound bundle to the selection rather
    than filtering by clock themselves.
    """

    def __init__(self, simvar, problem):
        super().__init__(simvar)
        # Reference to the SimProblem so marking can read the current clock.
        self.problem = problem
        # Tell SimProblem.bfs that this place is time-ordered, so its max_time gating
        # only considers prefixes that are available at (or before) the current clock.
        self._sorted_by_time = True

    @property
    def marking(self):
        tokens = list(self.simvar.marking)  # underlying tokens, sorted by time ascending
        if not tokens:
            return []

        clock = self.problem.clock
        available = [t for t in tokens if t.time <= clock]
        future_times = sorted({t.time for t in tokens if t.time > clock})

        result = []
        if available:
            # All currently-available tokens, timed so the bundle is bindable now.
            result.append(SimToken(available, time=min(t.time for t in available)))
        for ft in future_times:
            # Cumulative prefix: everything that will exist at time ft.
            prefix = [t for t in tokens if t.time <= ft]
            result.append(SimToken(prefix, time=ft))
        return result

    def remove_token(self, token):
        # Consume exactly the tokens in the bound bundle/prefix, leaving any
        # later-arriving tokens in the underlying place untouched.
        for t in token.value:
            if t in self.simvar.marking:
                self.simvar.marking.remove(t)


class OCPNVar(SimVar):
    """
    An OCPNVar represents a typed place in an object-centric Petri net.
    Each variable corresponds to an object type and holds tokens representing objects of that type.
    
    Attributes:
        object_type: The type of objects this variable holds
    """
    
    # Class-level color dictionary shared across all instances
    _shared_object_type_colors = {}
    _color_counter = 0  # Counter for sequential color assignment
    
    def __init__(self, model, object_type, id, priority=None):
        """
        Initialize an OCPNVar.

        Args:
            model: The SimProblem model this variable belongs to
            object_type: The type of objects this variable holds (e.g., "PO", "item")
            id: The identifier/name of this variable
            priority: Optional priority function for token ordering
        """
        _id = id
        super().__init__(_id, priority)
        self.object_type = object_type
        # Register this variable with the model using add_prototype_var
        model.add_prototype_var(self)
        # Create a time-aware queue for variable arcs (after super init sets _id)
        self.queue = TimedSimVarQueue(self, model)
    
    def put(self, *tokens):
        """
        Put tokens (objects) into this variable.
        Tokens should be dictionaries with an 'object_type' field matching this variable's type.
        
        Args:
            *tokens: Variable number of token dictionaries to put into this variable
        """
        # Validate that tokens have the correct object_type (optional validation)
        for token in tokens:
            if isinstance(token, dict) and 'object_type' in token:
                if token['object_type'] != self.object_type:
                    raise ValueError(f"Token object_type '{token['object_type']}' does not match variable type '{self.object_type}'")
            elif isinstance(token, dict) and 'object_type' not in token:
                raise ValueError(f"Token '{token}' is a dictionary but does not have an 'object_type' field")
            elif not isinstance(token, dict):
                raise ValueError(f"Token '{token}' is not a dictionary")

        super().put(*tokens)
    
    class OCPNVarViz(vis.PlaceViz):
        def __init__(self, model_node):
            super().__init__(model_node)
            # Get object_type from the model_node (which is the OCPNVar instance)
            self._object_type = None
            
            if hasattr(model_node, 'object_type'):
                self._object_type = model_node.object_type

        def get_color_for_object_type(self, object_type):
            """Get a consistent color for an object type (shared across all instances)."""
            if object_type not in OCPNVar._shared_object_type_colors:
                # Use sequential assignment to ensure different object types get different colors
                # If we run out of colors, cycle through them
                color_idx = OCPNVar._color_counter % len(TASK_TOKEN_SHOW_COLOURS)
                OCPNVar._shared_object_type_colors[object_type] = TASK_TOKEN_SHOW_COLOURS[color_idx]
                OCPNVar._color_counter += 1
            return OCPNVar._shared_object_type_colors[object_type]
        
        def draw(self, screen):
            # Use custom color if object_type is set, otherwise use default
            if self._object_type:
                fill_color = self.get_color_for_object_type(self._object_type)
                # Use a darker version for the border
                border_color = pygame.Color(
                    max(0, fill_color.r - 40),
                    max(0, fill_color.g - 40),
                    max(0, fill_color.b - 40))
            else:
                fill_color = vis.TUE_LIGHTBLUE
                border_color = vis.TUE_BLUE
            
            pygame.draw.circle(screen, fill_color, (self._pos[0], self._pos[1]), self._half_height)
            pygame.draw.circle(screen, border_color, (self._pos[0], self._pos[1]), self._half_height, vis.LINE_WIDTH)
            font = pygame.font.SysFont("Calibri", vis.TEXT_SIZE)

            # draw label
            label = font.render(self._model_node.get_id(), True, border_color)
            text_x_pos = self._pos[0] - int(label.get_width() / 2)
            text_y_pos = self._pos[1] + self._half_height + vis.LINE_WIDTH
            screen.blit(label, (text_x_pos, text_y_pos))

            # draw marking as tokens
            vis.TokenShower(self._model_node.marking).set_pos(self._pos).set_time(self._curr_time).show_token_count().draw(screen)

    def get_visualisation(self):
        """Return visualization for this typed variable."""
        return self.OCPNVarViz(self)

class OCPNEvent(SimEvent):
    """
    An OCPNEvent represents a transition in an object-centric Petri net.
    It can consume and produce collections of objects from multiple typed places (variables).
    
    Attributes:
        incoming_vars: List of (OCPNVar, variable_arc [True/False]) instances from which tokens are consumed
        outgoing_vars: List of (OCPNVar, variable_arc [True/False]) instances to which tokens are produced
        guard: guard function that determines when the event can fire
        behavior: behavior function that defines token consumption/production
        selection: selection function that determines which tokens from a variable arcs are selected. The guard and behavior functions are called with the selected tokens as arguments.
    """
    
    def __init__(self, model, incoming_vars, outgoing_vars, name, guard=None, behavior=None, selection=None):
        """
        Initialize an OCPNEvent.
        
        Args:
            model: The SimProblem model this event belongs to
            incoming_vars: List of (OCPNVar, variable_arc [True/False]) instances from which tokens are consumed
            outgoing_vars: List of (OCPNVar, variable_arc [True/False]) instances to which tokens are produced
            name: The name of this event
            guard: Optional guard function that returns a boolean indicating if the event can fire (default: None)
            behavior: Required behavior function that returns a list of tokens to be put into the outgoing variables
            selection: Optional selection function that determines which tokens from variable arcs are selected.
                       Must have the same number of parameters as incoming_vars. Must return a list with the same
                       elements in the same order, but for queue (variable arc) elements can return a subset.
                       The guard and behavior functions are called with the selected tokens as arguments.
        """
        # Extract the underlying SimVar instances from OCPNVar objects
        incoming_simvars = []
        for var, is_variable in incoming_vars:
            if isinstance(var, OCPNVar):
                if is_variable:
                    incoming_simvars.append(var.queue)
                else:
                    incoming_simvars.append(var)
            else:
                incoming_simvars.append(var)
        
        outgoing_simvars = []
        for var, is_variable in outgoing_vars: 
            if isinstance(var, OCPNVar):
                if is_variable:
                    outgoing_simvars.append(var.queue)
                else:
                    outgoing_simvars.append(var)
            else:
                outgoing_simvars.append(var)
        
        # Ensure behavior for returning objects not consumed in (p,t) with variable arcs
        return_variable_arcs = []
        for var, is_variable in incoming_vars:
            if isinstance(var, OCPNVar) and is_variable:
                return_variable_arcs.append(var.queue)
        
        outgoing_simvars.extend(return_variable_arcs)

        #TODO: for def 5.2, if an incoming var is variable_arc, outgoing var of same object_type should also be variable_arc
        for var, is_variable in incoming_vars:
            if isinstance(var, OCPNVar) and is_variable:
                for var2, is_variable2 in outgoing_vars:
                    if isinstance(var2, OCPNVar) and var2.object_type == var.object_type and not is_variable2:
                        raise ValueError(f"Error: Outgoing var {var2.get_id()} of same object type {var2.object_type} as incoming var {var.get_id()} is not a variable arc")

        # Validate selection function parameter count
        if selection is not None:
            sel_params = inspect.signature(selection).parameters
            num_sel_params = len([p for p in sel_params.values()
                                 if p.kind not in (inspect.Parameter.VAR_POSITIONAL, inspect.Parameter.VAR_KEYWORD)])
            if num_sel_params != len(incoming_vars):
                raise ValueError(
                    f"Selection function for '{name}' has {num_sel_params} parameters, "
                    f"but there are {len(incoming_vars)} incoming variables"
                )

        # Store the original OCPNVar references before creating wrappers
        self.model = model
        self.incoming_vars = incoming_vars
        self.outgoing_vars = outgoing_vars
        self._user_guard = guard
        self._user_behavior = behavior
        self._user_selection = selection
        
        # Create wrapped guard and behavior functions with object type and variable arc return checking
        wrapped_guard = self._create_wrapped_guard(guard, incoming_vars, selection)
        wrapped_behavior = self._create_wrapped_behavior(behavior, incoming_vars, outgoing_vars, return_variable_arcs, selection)
        
        # Initialize SimEvent with the extracted SimVars and wrapped functions
        super().__init__(_id=name, guard=wrapped_guard, behavior=wrapped_behavior, incoming=incoming_simvars, outgoing=outgoing_simvars)
        
        # Add this event to the model using add_prototype_event
        model.add_prototype_event(self)
    
    def _validate_selection_result(self, selected, args, incoming_vars):
        """Validate the result of a selection function against the original args."""
        if not isinstance(selected, list):
            raise ValueError(f"Selection function for '{self.get_id()}' must return a list")
        if len(selected) != len(incoming_vars):
            raise ValueError(
                f"Selection function for '{self.get_id()}' returned {len(selected)} elements, "
                f"expected {len(incoming_vars)}"
            )
        for i, (var, is_variable) in enumerate(incoming_vars):
            if is_variable:
                # Queue element: must be a list, subset of original, in same order
                if not isinstance(selected[i], list):
                    raise ValueError(
                        f"Selection function for '{self.get_id()}': element at position {i} "
                        f"should be a list (queue) since incoming var is a variable arc"
                    )
                last_idx = -1
                for t in selected[i]:
                    found_idx = None
                    for j in range(last_idx + 1, len(args[i])):
                        if t is args[i][j]:
                            found_idx = j
                            break
                    if found_idx is None:
                        raise ValueError(
                            f"Selection function for '{self.get_id()}': element in queue at position {i} "
                            f"is not from the original queue or is not in the original order"
                        )
                    last_idx = found_idx
            else:
                # Single value: must be the same object
                if selected[i] is not args[i]:
                    raise ValueError(
                        f"Selection function for '{self.get_id()}': element at position {i} "
                        f"must be the same object as the original"
                    )

    def _create_wrapped_guard(self, user_guard, incoming_vars, selection=None):
        """Create a guard function that wraps the user's guard with object type checking and selection."""
        def wrapped_guard(*args):
            # Check object type constraints for incoming tokens
            for i, arg in enumerate(args):
                if i < len(incoming_vars):
                    var, is_variable = incoming_vars[i]
                    if isinstance(var, OCPNVar):
                        expected_object_type = var.object_type
                        
                        if is_variable:
                            # For variable arcs, arg is a queue
                            if hasattr(arg, '__iter__'):
                                for token in arg:
                                    if hasattr(token, 'value') and isinstance(token.value, dict):
                                        token_obj_type = token.value.get('object_type')
                                        if token_obj_type and token_obj_type != expected_object_type:
                                            # Guard fails if token type doesn't match
                                            return False
                        else:
                            # For regular arcs, arg is a single token value
                            if isinstance(arg, dict):
                                token_obj_type = arg.get('object_type')
                                if token_obj_type and token_obj_type != expected_object_type:
                                    # Guard fails if token type doesn't match
                                    return False
            
            # Apply selection if provided
            if selection is not None:
                # The TimedSimVarQueue already presents only the tokens that are
                # available at the current clock, so the selection sees the full bound
                # bundle and the guard stays time-independent (required for SimPN's
                # look_beyond clock advancement to work).
                selected = selection(*args)
                self._validate_selection_result(selected, args, incoming_vars)
                # If any selected queue is empty, guard fails
                for i, (var, is_variable) in enumerate(incoming_vars):
                    if is_variable:
                        if len(selected[i]) == 0:
                            return False
                # Call user guard on selected args
                if user_guard:
                    return user_guard(*selected)
                return True
            else:
                # No selection, call user guard directly
                if user_guard:
                    return user_guard(*args)
                return True
        
        return wrapped_guard
    
    def _create_wrapped_behavior(self, user_behavior, incoming_vars, outgoing_vars, return_variable_arcs, selection=None):
        """Create a behavior function that wraps the user's behavior with object type checking and selection."""
        # Build list of incoming variable arc indices (for automatic return of non-selected tokens)
        variable_arc_indices = []
        for i, (var, is_variable) in enumerate(incoming_vars):
            if isinstance(var, OCPNVar) and is_variable:
                variable_arc_indices.append(i)

        def wrapped_behavior(*args):
            # Apply selection and call user's behavior function
            if selection is not None:
                # The TimedSimVarQueue already presents only the tokens available at the
                # current clock, so the selection sees the full bound bundle.
                selected = selection(*args)
                self._validate_selection_result(selected, args, incoming_vars)
                if user_behavior:
                    result = user_behavior(*selected)
            else:
                if user_behavior:
                    result = user_behavior(*args)
            
            # If selection was applied, add non-selected tokens to return arcs.
            # The full original queue is used (including not-yet-due tokens), and each
            # token keeps its original time so future and skipped items are not reset.
            if selection is not None:
                num_out = len(outgoing_vars)
                for j, arg_idx in enumerate(variable_arc_indices):
                    original_queue = args[arg_idx]
                    selected_queue = selected[arg_idx]
                    selected_ids = set(id(t) for t in selected_queue)
                    non_selected = [SimToken(t.value, time=t.time) for t in original_queue if id(t) not in selected_ids]
                    return_pos = num_out + j
                    if return_pos < len(result):
                        result[return_pos].extend(non_selected)
            
            # Map outgoing vars to their object types
            # Note: return_variable_arcs are appended at the end of outgoing_vars
            num_return_arcs = len(return_variable_arcs)
            num_outgoing = len(outgoing_vars)
            
            # Check that returned tokens match their destination object types
            for i, output in enumerate(result):
                # Determine which outgoing var this corresponds to
                if i < num_outgoing:
                    var, is_variable = outgoing_vars[i]
                    if isinstance(var, OCPNVar):
                        expected_object_type = var.object_type
                        
                        if is_variable:
                            # For variable arcs, output is a list/queue of tokens
                            if hasattr(output, '__iter__') and not isinstance(output, str):
                                for token in output:
                                    if hasattr(token, 'value') and isinstance(token.value, dict):
                                        token_obj_type = token.value.get('object_type')
                                        if token_obj_type and token_obj_type != expected_object_type:
                                            raise ValueError(
                                                f"Behavior error: Token with object_type '{token_obj_type}' "
                                                f"cannot be returned to place '{var.get_id()}' which expects object_type '{expected_object_type}'"
                                            )
                        else:
                            # For regular arcs, output is a single token
                            if hasattr(output, 'value') and isinstance(output.value, dict):
                                token_obj_type = output.value.get('object_type')
                                if token_obj_type and token_obj_type != expected_object_type:
                                    raise ValueError(
                                        f"Behavior error: Token with object_type '{token_obj_type}' "
                                        f"cannot be returned to place '{var.get_id()}' which expects object_type '{expected_object_type}'"
                                    )
                            elif isinstance(output, dict):
                                token_obj_type = output.get('object_type')
                                if token_obj_type and token_obj_type != expected_object_type:
                                    raise ValueError(
                                        f"Behavior error: Token with object_type '{token_obj_type}' "
                                        f"cannot be returned to place '{var.get_id()}' which expects object_type '{expected_object_type}'"
                                    )
                elif i < num_outgoing + num_return_arcs:
                    # This is a return variable arc - find the corresponding incoming var
                    return_idx = i - num_outgoing
                    if return_idx < len(incoming_vars):
                        var, is_variable = incoming_vars[return_idx]
                        if isinstance(var, OCPNVar) and is_variable:
                            expected_object_type = var.object_type
                            # Check tokens in return queue
                            if hasattr(output, '__iter__') and not isinstance(output, str):
                                for token in output:
                                    if hasattr(token, 'value') and isinstance(token.value, dict):
                                        token_obj_type = token.value.get('object_type')
                                        if token_obj_type and token_obj_type != expected_object_type:
                                            raise ValueError(
                                                f"Behavior error: Token with object_type '{token_obj_type}' "
                                                f"cannot be returned to place '{var.get_id()}' which expects object_type '{expected_object_type}'"
                                            )

            # Honor delays on outgoing variable arcs. The simulator adds queue tokens
            # directly (without applying clock + delay, unlike regular arcs), so convert
            # each produced token's delay into an absolute time here. Return arcs are left
            # untouched because their non-selected tokens already carry their original time.
            clock = self.model.clock
            for i, (var, is_variable) in enumerate(outgoing_vars):
                if is_variable and i < len(result) and result[i] is not None:
                    result[i] = [
                        SimToken(token.value, time=clock + token.delay)
                        if isinstance(token, SimToken) else token
                        for token in result[i]
                    ]

            return result
        
        return wrapped_behavior
    
    class OCPNEventViz(vis.TransitionViz):
        def __init__(self, model_node):
            super().__init__(model_node)
            # Get incoming object types from the model_node (which is the OCPNEvent instance)
            self._incoming_object_types_list = []  # List of object types in order of incoming vars
            
            if hasattr(model_node, 'incoming_vars'):
                # Store object types for each incoming var (in order)
                for var, is_variable in model_node.incoming_vars:
                    if isinstance(var, OCPNVar) and hasattr(var, 'object_type'):
                        self._incoming_object_types_list.append(var.object_type)
                    else:
                        # For non-OCPNVar vars, use None to represent default/unknown
                        self._incoming_object_types_list.append(None)

        def get_color_for_object_type(self, object_type):
            """Get a consistent color for an object type (same as OCPNVarViz, using shared dict)."""
            if object_type is None:
                return vis.TUE_LIGHTBLUE
            
            # Use the shared color dictionary from OCPNVar
            if object_type not in OCPNVar._shared_object_type_colors:
                # Use sequential assignment to ensure different object types get different colors
                # If we run out of colors, cycle through them
                color_idx = OCPNVar._color_counter % len(TASK_TOKEN_SHOW_COLOURS)
                OCPNVar._shared_object_type_colors[object_type] = TASK_TOKEN_SHOW_COLOURS[color_idx]
                OCPNVar._color_counter += 1
            return OCPNVar._shared_object_type_colors[object_type]
        
        def draw(self, screen):
            # Calculate rectangle bounds
            rect_left = self._pos[0] - self._half_width
            rect_top = self._pos[1] - self._half_height
            rect_width = self._width
            rect_height = self._height
            
            # Draw proportional sections if we have incoming object types
            if self._incoming_object_types_list:
                total_vars = len(self._incoming_object_types_list)
                section_width = rect_width / total_vars
                gradient_width = min(section_width * 0.3, 10)  # 30% of section width or max 10 pixels
                
                # Draw each section with gradient blending
                for i, object_type in enumerate(self._incoming_object_types_list):
                    section_left = rect_left + i * section_width
                    fill_color = self.get_color_for_object_type(object_type)
                    
                    # Determine next color for gradient (if not last section)
                    if i < len(self._incoming_object_types_list) - 1:
                        next_object_type = self._incoming_object_types_list[i + 1]
                        next_color = self.get_color_for_object_type(next_object_type)
                    else:
                        next_color = None
                    
                    # Draw main section
                    main_section_width = section_width - (gradient_width if next_color else 0)
                    pygame.draw.rect(
                        screen,
                        fill_color,
                        pygame.Rect(
                            section_left,
                            rect_top,
                            main_section_width,
                            rect_height,
                        ),
                    )
                    
                    # Draw gradient transition to next section
                    if next_color:
                        gradient_start = section_left + main_section_width
                        gradient_steps = int(gradient_width)
                        for step in range(gradient_steps):
                            # Interpolate between current and next color
                            ratio = step / gradient_steps
                            blended_color = pygame.Color(
                                int(fill_color.r + (next_color.r - fill_color.r) * ratio),
                                int(fill_color.g + (next_color.g - fill_color.g) * ratio),
                                int(fill_color.b + (next_color.b - fill_color.b) * ratio)
                            )
                            step_x = gradient_start + (step * gradient_width / gradient_steps)
                            step_width = gradient_width / gradient_steps
                            pygame.draw.rect(
                                screen,
                                blended_color,
                                pygame.Rect(
                                    step_x,
                                    rect_top,
                                    step_width,
                                    rect_height,
                                ),
                            )
            else:
                # Default color if no incoming object types
                fill_color = vis.TUE_LIGHTBLUE
                pygame.draw.rect(
                    screen,
                    fill_color,
                    pygame.Rect(
                        rect_left,
                        rect_top,
                        rect_width,
                        rect_height,
                    ),
                )
            
            # Draw border
            border_color = vis.TUE_BLUE
            pygame.draw.rect(
                screen,
                border_color,
                pygame.Rect(
                    rect_left,
                    rect_top,
                    rect_width,
                    rect_height,
                ),
                vis.LINE_WIDTH,
            )
            
            font = pygame.font.SysFont("Calibri", vis.TEXT_SIZE)

            # draw label
            label = font.render(self._model_node.get_id(), True, border_color)
            text_x_pos = self._pos[0] - int(label.get_width() / 2)
            text_y_pos = self._pos[1] + self._half_height + vis.LINE_WIDTH
            screen.blit(label, (text_x_pos, text_y_pos))

    def get_visualisation(self):
        """Return visualization for this event."""
        return self.OCPNEventViz(self)


