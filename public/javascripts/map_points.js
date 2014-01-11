(function() {
    var mapOptions = {
        zoom: 13,
        center: new google.maps.LatLng(37.7856101001445,-122.408154764336)
    };
    var map = null;
    var currentInfoWindow = null;

    var oms = null;

    var Truck = Backbone.Model.extend({
        initialize: function(options) {
            this.name       = options.key;
            this.location   = options.value;
        },
        getDetails: function() {
            var truck = this,
                deferred = $.Deferred();
            if(this.applicant) {
                deferred.resolve();
            } else {
                $.getJSON('https://sf-food-trucks.cloudant.com/trucks/' + this.id + '?callback=?', function(data) {
                    console.log('data', data);
                    truck.applicant = data.applicant;
                    truck.address   = data.address;
                    truck.fooditems = data.fooditems;
                    truck.schedule  = data.schedule;
                    deferred.resolve();
                });
            }
            return deferred;
        },
        showInfoWindow: function(marker) {
            var truck = this;

            this.getDetails().done(function() {
                var infoWindow = new google.maps.InfoWindow({
                    content: showDetails(truck)
                });
                if(currentInfoWindow) {
                    currentInfoWindow.close();
                }
                currentInfoWindow = infoWindow;
                infoWindow.open(map,marker);
            });
        }
    });

    var trucks = new Backbone.Collection([], {
        model: Truck
    });

    trucks.on("add", function(truck) {
        if(!(truck.name && truck.location)){ return; }
        var marker = new google.maps.Marker({
            position: new google.maps.LatLng(truck.location.latitude,truck.location.longitude),
            map: map,
            title: truck.name,
            _id: truck.id
        });
        oms.addMarker(marker);
    });

    function showDetails(truck) {
        var returnStr = '';
        returnStr += '<h1>' + truck.applicant + '</h1>';
        returnStr += '<p>' + truck.address + '</p>';
        returnStr += '<p>' + truck.fooditems + '</p>';
        returnStr += '<br />';
        returnStr += '<a href="' + truck.schedule + '">View Schedule</a> (pdf)';
        return returnStr;
    }

    function initialize() {
        map = new google.maps.Map(document.getElementById('map-canvas'), mapOptions);
        oms = new OverlappingMarkerSpiderfier(map, {
                keepSpiderfied: true,
                nearbyDistance: 5,
                legWeight: 1
            });
        var searchBox = new google.maps.places.SearchBox($('#map-search')[0]);

        oms.addListener('click', function(marker, event) {
            trucks.get(marker._id).showInfoWindow(marker);
        });

        google.maps.event.addListener(searchBox, 'places_changed', function() {
            var places = searchBox.getPlaces();
            var markers = [];

            for (var i = 0, marker; marker = markers[i]; i++) {
                marker.setMap(null);
            }

            // For each place, get the icon, place name, and location.
            markers = [];
            var bounds = new google.maps.LatLngBounds();
            for (var i = 0, place; place = places[i]; i++) {
                var image = {
                    url: place.icon,
                    size: new google.maps.Size(71, 71),
                    origin: new google.maps.Point(0, 0),
                    anchor: new google.maps.Point(17, 34),
                    scaledSize: new google.maps.Size(25, 25)
                };

                // Create a marker for each place.
                var marker = new google.maps.Marker({
                    map: map,
                    icon: image,
                    title: place.name,
                    position: place.geometry.location
                });

                markers.push(marker);

                bounds.extend(place.geometry.location);
            }

            map.fitBounds(bounds);
            console.log('zoom', map.getZoom());
            map.setZoom(18);
        });

        $.getJSON('https://sf-food-trucks.cloudant.com/trucks/_design/approved/_view/approvedTrucksView?limit=1000&reduce=false&callback=?', function(data){
            var dataRows = data.rows;
            trucks.add(dataRows);
        });
    }

    google.maps.event.addDomListener(window, 'load', initialize);
    Backbone.history.start({pushState: true});
})();