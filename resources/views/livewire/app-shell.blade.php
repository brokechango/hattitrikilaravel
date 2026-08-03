<div
    id="app"
    data-livewire-host="app-shell"
    data-route-name="{{ $routeName }}"
    data-route-path="{{ $routePath }}"
    data-route-source="server"
    @if ($resourceId !== null) data-route-resource="{{ $resourceId }}" @endif
    aria-live="polite"
>
    @if (! $authenticated || $authFlow !== null)
        <livewire:auth-panel :flow="$authFlow" />
    @else
        <livewire:league-shell
            :route-name="$routeName"
            :route-path="$routePath"
            :resource-id="$resourceId"
        />
    @endif
</div>
