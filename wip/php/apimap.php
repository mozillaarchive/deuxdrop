<?php

require_once dirname(__FILE__) . '/routemap-0.9.1.php';

class api extends RouteMap {
    public function dispatch($url)
    {
        try
        {
            list($route, $action, $args) = $this->match($url);
        }
        catch (ERouteMapNotFound $e)
        {
            exit('Error: Route not found');
        }
        catch (ERouteMapNoMatch $e)
        {
            exit('Error: Page not found');
        }
        catch (ERouteMapReqs $e)
        {
            exit('Error: Invalid URL arguments');
        }
        catch (ERouteMapNoReqs $e)
        {
            exit('Error: Ambiguous URL rules detected');
        }

        $this->current = $route;

        $res = array('result'=>null, 'error'=>null);
        try {
            if (empty($action[0]))
                $action = $action[1];
            if (!is_array($args))
                $args = array();
            $res['result'] = call_user_func_array($action, $args);
        } catch (Exception $e) {
            $res['error'] = array(
                "message"=>$e->getMessage(),
                "errno"=>$e->getCode(),
                "traceback"=>$e->getTraceAsString()
            );
        }
        header('Content-type: application/json');
        echo json_encode($res);
    }
}

